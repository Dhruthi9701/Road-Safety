"""
NHAI FaceAuth — Anti-Spoofing Model Training Pipeline

Trains a MobileNetV2-based binary classifier for passive liveness detection.
Distinguishes real faces from spoofing attacks (printed photos, screen replay, 3D masks).

Architecture:
- Backbone: MobileNetV2 (ImageNet pre-trained)
- Head: Global Average Pooling → FC(1280, 256) → FC(256, 2)
- Output: [real_probability, spoof_probability]
- Input: 224x224 RGB face crop

Datasets:
- NUAA Imposter Database
- CASIA-FASD (Face Anti-Spoofing Database)
- Replay-Attack Database
- MSU-MFSD (Mobile Face Spoofing Database)

Usage:
    python train_antispoof.py --data_dir /path/to/dataset \
        --epochs 30 --batch_size 32 --lr 0.001
"""

import os
import argparse
import logging
from pathlib import Path
from typing import Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, random_split
from torchvision import transforms, models
from PIL import Image
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL
# ═══════════════════════════════════════════════════════════════════════════════

class AntiSpoofNet(nn.Module):
    """
    MobileNetV2-based face anti-spoofing model.

    Uses transfer learning from ImageNet to classify faces as
    real (live) or spoof (attack). Lightweight enough for mobile deployment.

    Output: 2-class softmax [real_probability, spoof_probability]
    """

    def __init__(self, pretrained: bool = True):
        super().__init__()

        # Load MobileNetV2 backbone
        self.backbone = models.mobilenet_v2(
            weights='IMAGENET1K_V1' if pretrained else None
        )

        # Replace classifier head
        num_features = self.backbone.classifier[1].in_features  # 1280
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(num_features, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.2),
            nn.Linear(256, 2),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input tensor (B, 3, 224, 224), normalized to ImageNet stats

        Returns:
            Logits of shape (B, 2) — [real, spoof]
        """
        return self.backbone(x)

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Get softmax probabilities."""
        logits = self.forward(x)
        return F.softmax(logits, dim=1)


# ═══════════════════════════════════════════════════════════════════════════════
# DATASET
# ═══════════════════════════════════════════════════════════════════════════════

class AntiSpoofDataset(Dataset):
    """
    Anti-spoofing dataset loader.

    Expected directory structure:
    data_dir/
      real/         # Real face images
        img001.jpg
        img002.jpg
      spoof/        # Spoofed face images (prints, screens, masks)
        img001.jpg
        img002.jpg

    OR:
    data_dir/
      real/
      print_attack/
      screen_attack/
      mask_attack/
    """

    def __init__(self, data_dir: str, transform=None):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.samples = []

        # Real samples (label = 0)
        real_dir = self.data_dir / 'real'
        if real_dir.exists():
            for img_path in real_dir.rglob('*'):
                if img_path.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp'):
                    self.samples.append((str(img_path), 0))

        # Spoof samples (label = 1)
        spoof_dirs = ['spoof', 'print_attack', 'screen_attack', 'mask_attack']
        for spoof_name in spoof_dirs:
            spoof_dir = self.data_dir / spoof_name
            if spoof_dir.exists():
                for img_path in spoof_dir.rglob('*'):
                    if img_path.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp'):
                        self.samples.append((str(img_path), 1))

        real_count = sum(1 for _, l in self.samples if l == 0)
        spoof_count = sum(1 for _, l in self.samples if l == 1)
        logger.info(
            f"Loaded dataset: {len(self.samples)} images "
            f"(Real: {real_count}, Spoof: {spoof_count})"
        )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        img_path, label = self.samples[idx]

        try:
            img = Image.open(img_path).convert('RGB')
        except Exception as e:
            logger.warning(f"Failed to load {img_path}: {e}")
            img = Image.new('RGB', (224, 224), (128, 128, 128))

        if self.transform:
            img = self.transform(img)

        return img, label


def get_train_transforms() -> transforms.Compose:
    """
    Training augmentations for anti-spoofing.
    Simulates various attack conditions and lighting.
    """
    return transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomCrop((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(
            brightness=0.4,
            contrast=0.4,
            saturation=0.3,
            hue=0.05,
        ),
        transforms.RandomGrayscale(p=0.1),
        transforms.RandomRotation(degrees=10),
        # Simulate compression artifacts (common in screen replay)
        transforms.RandomChoice([
            transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 2.0)),
            transforms.Lambda(lambda x: x),  # No blur
        ]),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],  # ImageNet stats
            std=[0.229, 0.224, 0.225],
        ),
        transforms.RandomErasing(p=0.15, scale=(0.02, 0.10)),
    ])


def get_val_transforms() -> transforms.Compose:
    """Validation transforms (no augmentation)."""
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# TRAINING
# ═══════════════════════════════════════════════════════════════════════════════

class AntiSpoofTrainer:
    """Anti-spoofing model trainer with evaluation."""

    def __init__(self, args):
        self.args = args
        self.device = torch.device(
            'cuda' if torch.cuda.is_available() else 'cpu'
        )
        logger.info(f"Using device: {self.device}")

        # Dataset
        full_dataset = AntiSpoofDataset(
            args.data_dir, transform=get_train_transforms()
        )

        # Split train/val (80/20)
        train_size = int(0.8 * len(full_dataset))
        val_size = len(full_dataset) - train_size
        train_dataset, val_dataset = random_split(
            full_dataset, [train_size, val_size]
        )

        # Override val transforms
        val_dataset.dataset = AntiSpoofDataset(
            args.data_dir, transform=get_val_transforms()
        )

        self.train_loader = DataLoader(
            train_dataset, batch_size=args.batch_size,
            shuffle=True, num_workers=args.num_workers, pin_memory=True,
        )
        self.val_loader = DataLoader(
            val_dataset, batch_size=args.batch_size,
            shuffle=False, num_workers=args.num_workers, pin_memory=True,
        )

        # Model
        self.model = AntiSpoofNet(pretrained=True).to(self.device)

        # Class weights for imbalanced datasets
        real_count = sum(1 for _, l in full_dataset.samples if l == 0)
        spoof_count = sum(1 for _, l in full_dataset.samples if l == 1)
        total = real_count + spoof_count
        weights = torch.FloatTensor([
            total / (2 * real_count),
            total / (2 * spoof_count),
        ]).to(self.device)

        self.criterion = nn.CrossEntropyLoss(weight=weights)

        # Optimizer — freeze backbone initially, fine-tune later
        # First freeze backbone
        for param in self.model.backbone.features.parameters():
            param.requires_grad = False

        self.optimizer = optim.Adam(
            filter(lambda p: p.requires_grad, self.model.parameters()),
            lr=args.lr,
            weight_decay=1e-4,
        )

        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', patience=3, factor=0.5
        )

        self.output_dir = Path(args.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.best_val_acc = 0.0

        total_params = sum(p.numel() for p in self.model.parameters())
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        logger.info(
            f"Model params: {total_params:,} total, {trainable_params:,} trainable"
        )

    def unfreeze_backbone(self):
        """Unfreeze backbone for fine-tuning (after initial training)."""
        for param in self.model.backbone.features.parameters():
            param.requires_grad = True

        # Lower learning rate for backbone
        self.optimizer = optim.Adam([
            {'params': self.model.backbone.features.parameters(), 'lr': self.args.lr * 0.1},
            {'params': self.model.backbone.classifier.parameters(), 'lr': self.args.lr},
        ], weight_decay=1e-4)

        logger.info("Backbone unfrozen for fine-tuning")

    def train_epoch(self, epoch: int) -> float:
        """Train for one epoch."""
        self.model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for batch_idx, (images, labels) in enumerate(self.train_loader):
            images = images.to(self.device)
            labels = labels.to(self.device)

            logits = self.model(images)
            loss = self.criterion(logits, labels)

            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 5.0)
            self.optimizer.step()

            total_loss += loss.item()
            _, predicted = logits.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(self.train_loader)
        accuracy = 100.0 * correct / total
        logger.info(f"  Train — Loss: {avg_loss:.4f}, Acc: {accuracy:.2f}%")
        return avg_loss

    def validate(self) -> dict:
        """Validate model on validation set."""
        self.model.eval()
        all_preds = []
        all_labels = []
        all_probs = []

        with torch.no_grad():
            for images, labels in self.val_loader:
                images = images.to(self.device)
                labels = labels.to(self.device)

                logits = self.model(images)
                probs = F.softmax(logits, dim=1)

                _, predicted = logits.max(1)
                all_preds.extend(predicted.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())
                all_probs.extend(probs[:, 1].cpu().numpy())

        all_preds = np.array(all_preds)
        all_labels = np.array(all_labels)
        all_probs = np.array(all_probs)

        metrics = {
            'accuracy': accuracy_score(all_labels, all_preds),
            'precision': precision_score(all_labels, all_preds, zero_division=0),
            'recall': recall_score(all_labels, all_preds, zero_division=0),
            'f1': f1_score(all_labels, all_preds, zero_division=0),
            'auc_roc': roc_auc_score(all_labels, all_probs) if len(np.unique(all_labels)) > 1 else 0,
        }

        cm = confusion_matrix(all_labels, all_preds)

        logger.info(
            f"  Val — Acc: {metrics['accuracy']:.4f}, "
            f"F1: {metrics['f1']:.4f}, AUC: {metrics['auc_roc']:.4f}"
        )
        logger.info(f"  Confusion Matrix:\n{cm}")

        return metrics

    def save_model(self, epoch: int, metrics: dict):
        """Save model checkpoint."""
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'metrics': metrics,
        }
        path = self.output_dir / 'antispoof_best.pth'
        torch.save(checkpoint, path)
        logger.info(f"Best model saved: {path}")

    def train(self):
        """Full training loop with backbone unfreezing."""
        logger.info("Phase 1: Training classifier head (backbone frozen)...")

        for epoch in range(1, self.args.epochs + 1):
            logger.info(f"\nEpoch {epoch}/{self.args.epochs}")

            # Unfreeze backbone after 10 epochs
            if epoch == 11:
                logger.info("\nPhase 2: Fine-tuning full model...")
                self.unfreeze_backbone()

            train_loss = self.train_epoch(epoch)
            val_metrics = self.validate()

            self.scheduler.step(train_loss)

            if val_metrics['accuracy'] > self.best_val_acc:
                self.best_val_acc = val_metrics['accuracy']
                self.save_model(epoch, val_metrics)

        logger.info(f"\nTraining complete! Best val accuracy: {self.best_val_acc:.4f}")

        # Export to ONNX
        self.export_onnx()

    def export_onnx(self):
        """Export model to ONNX format."""
        self.model.eval()
        dummy = torch.randn(1, 3, 224, 224).to(self.device)
        onnx_path = self.output_dir / 'antispoof_mobilenetv2.onnx'

        torch.onnx.export(
            self.model, dummy, str(onnx_path),
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'},
            },
            opset_version=13,
        )
        logger.info(f"ONNX model exported: {onnx_path}")


def parse_args():
    parser = argparse.ArgumentParser(
        description='Train Anti-Spoofing Model for NHAI FaceAuth'
    )
    parser.add_argument('--data_dir', type=str, required=True,
                        help='Path to anti-spoofing dataset (real/ and spoof/ subdirs)')
    parser.add_argument('--output_dir', type=str, default='./output',
                        help='Output directory')
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=0.001)
    parser.add_argument('--num_workers', type=int, default=4)
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    trainer = AntiSpoofTrainer(args)
    trainer.train()
