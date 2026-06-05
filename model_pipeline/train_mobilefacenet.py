"""
NHAI FaceAuth — MobileFaceNet Training Pipeline

Fine-tunes MobileFaceNet for face recognition with focus on Indian demographics.
Uses ArcFace loss for discriminative face embeddings.

Architecture:
- Backbone: Modified MobileNetV2 with depthwise separable convolutions
- Output: 128-dimensional L2-normalized face embedding
- Loss: ArcFace (Additive Angular Margin)
- Input: 112x112 RGB aligned face images

Usage:
    python train_mobilefacenet.py --data_dir /path/to/dataset \
        --epochs 50 --batch_size 64 --lr 0.01

Datasets:
    - VGGFace2 (primary): 3.3M images, 9131 subjects
    - MS-Celeb-1M (filtered): For pre-training
    - Custom Indian demographic dataset (recommended for fine-tuning)

Requirements:
    pip install -r requirements.txt
"""

import os
import sys
import math
import argparse
import logging
from pathlib import Path
from typing import Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════

class DepthwiseSeparableConv(nn.Module):
    """Depthwise separable convolution block used in MobileFaceNet."""

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1):
        super().__init__()
        self.depthwise = nn.Conv2d(
            in_channels, in_channels, kernel_size=3,
            stride=stride, padding=1, groups=in_channels, bias=False
        )
        self.bn1 = nn.BatchNorm2d(in_channels)
        self.pointwise = nn.Conv2d(
            in_channels, out_channels, kernel_size=1, bias=False
        )
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.prelu = nn.PReLU(out_channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.depthwise(x)
        x = self.bn1(x)
        x = self.pointwise(x)
        x = self.bn2(x)
        x = self.prelu(x)
        return x


class InvertedResidual(nn.Module):
    """Inverted residual block (MobileNetV2-style) for MobileFaceNet."""

    def __init__(self, in_channels: int, out_channels: int,
                 stride: int = 1, expand_ratio: int = 1):
        super().__init__()
        self.use_residual = stride == 1 and in_channels == out_channels
        hidden_dim = in_channels * expand_ratio

        layers = []
        if expand_ratio != 1:
            # Expansion layer
            layers.extend([
                nn.Conv2d(in_channels, hidden_dim, 1, bias=False),
                nn.BatchNorm2d(hidden_dim),
                nn.PReLU(hidden_dim),
            ])

        # Depthwise convolution
        layers.extend([
            nn.Conv2d(hidden_dim, hidden_dim, 3, stride=stride,
                      padding=1, groups=hidden_dim, bias=False),
            nn.BatchNorm2d(hidden_dim),
            nn.PReLU(hidden_dim),
        ])

        # Projection layer
        layers.extend([
            nn.Conv2d(hidden_dim, out_channels, 1, bias=False),
            nn.BatchNorm2d(out_channels),
        ])

        self.block = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if self.use_residual:
            return x + self.block(x)
        return self.block(x)


class MobileFaceNet(nn.Module):
    """
    MobileFaceNet — Efficient CNN for face recognition on mobile devices.

    Architecture follows the paper "MobileFaceNets: Efficient CNNs for
    Accurate Real-Time Face Verification on Mobile Devices"

    Input: 112x112x3 RGB face image
    Output: 128-dimensional L2-normalized face embedding
    Parameters: ~1M (significantly smaller than FaceNet/ArcFace ResNet)
    """

    def __init__(self, embedding_dim: int = 128):
        super().__init__()
        self.embedding_dim = embedding_dim

        # Initial convolution
        self.conv1 = nn.Sequential(
            nn.Conv2d(3, 64, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.PReLU(64),
        )

        # Depthwise separable conv
        self.dw_conv = DepthwiseSeparableConv(64, 64)

        # Inverted residual blocks
        # Configuration: [expand_ratio, out_channels, num_blocks, stride]
        self.blocks = nn.Sequential(
            # Stage 1
            InvertedResidual(64, 64, stride=2, expand_ratio=2),
            InvertedResidual(64, 64, stride=1, expand_ratio=2),
            InvertedResidual(64, 64, stride=1, expand_ratio=2),
            InvertedResidual(64, 64, stride=1, expand_ratio=2),
            InvertedResidual(64, 64, stride=1, expand_ratio=2),
            # Stage 2
            InvertedResidual(64, 128, stride=2, expand_ratio=4),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
            # Stage 3
            InvertedResidual(128, 128, stride=2, expand_ratio=4),
            InvertedResidual(128, 128, stride=1, expand_ratio=2),
        )

        # Final convolution
        self.conv2 = nn.Sequential(
            nn.Conv2d(128, 512, 1, bias=False),
            nn.BatchNorm2d(512),
            nn.PReLU(512),
        )

        # Global depthwise convolution (replaces avg pooling)
        # At this point, feature map is 7x7
        self.gdw_conv = nn.Sequential(
            nn.Conv2d(512, 512, 7, groups=512, bias=False),
            nn.BatchNorm2d(512),
        )

        # Linear embedding layer
        self.linear = nn.Sequential(
            nn.Linear(512, embedding_dim, bias=False),
            nn.BatchNorm1d(embedding_dim),
        )

        # Initialize weights
        self._initialize_weights()

    def _initialize_weights(self):
        """Kaiming initialization for all layers."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d) or isinstance(m, nn.BatchNorm1d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input tensor of shape (B, 3, 112, 112), pixel values in [-1, 1]

        Returns:
            L2-normalized embedding of shape (B, embedding_dim)
        """
        x = self.conv1(x)
        x = self.dw_conv(x)
        x = self.blocks(x)
        x = self.conv2(x)
        x = self.gdw_conv(x)
        x = x.view(x.size(0), -1)
        x = self.linear(x)

        # L2 normalize
        x = F.normalize(x, p=2, dim=1)
        return x


# ═══════════════════════════════════════════════════════════════════════════════
# ARCFACE LOSS
# ═══════════════════════════════════════════════════════════════════════════════

class ArcFaceLoss(nn.Module):
    """
    ArcFace: Additive Angular Margin Loss for Deep Face Recognition.

    Adds an angular margin penalty to the target logit, forcing the model
    to learn more discriminative embeddings.

    Paper: "ArcFace: Additive Angular Margin Loss for Deep Face Recognition"
    """

    def __init__(self, embedding_dim: int, num_classes: int,
                 s: float = 64.0, m: float = 0.50):
        """
        Args:
            embedding_dim: Size of face embedding (128)
            num_classes: Number of identity classes
            s: Scale factor (default: 64.0)
            m: Angular margin in radians (default: 0.50)
        """
        super().__init__()
        self.s = s
        self.m = m
        self.cos_m = math.cos(m)
        self.sin_m = math.sin(m)
        self.th = math.cos(math.pi - m)
        self.mm = math.sin(math.pi - m) * m

        # Weight matrix (class centers)
        self.weight = nn.Parameter(torch.FloatTensor(num_classes, embedding_dim))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, embeddings: torch.Tensor,
                labels: torch.Tensor) -> torch.Tensor:
        """
        Args:
            embeddings: L2-normalized face embeddings (B, embedding_dim)
            labels: Ground truth identity labels (B,)

        Returns:
            ArcFace logits scaled by s
        """
        # Normalize weights
        normalized_weight = F.normalize(self.weight, p=2, dim=1)

        # Cosine similarity
        cosine = F.linear(embeddings, normalized_weight)
        sine = torch.sqrt(1.0 - torch.clamp(cosine * cosine, 0, 1))

        # cos(theta + m) = cos(theta)*cos(m) - sin(theta)*sin(m)
        phi = cosine * self.cos_m - sine * self.sin_m

        # Numerical stability
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)

        # One-hot encode labels
        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1).long(), 1)

        # Apply margin only to target class
        output = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        output *= self.s

        return output


# ═══════════════════════════════════════════════════════════════════════════════
# DATASET
# ═══════════════════════════════════════════════════════════════════════════════

class FaceDataset(Dataset):
    """
    Face recognition dataset loader.

    Expects directory structure:
    data_dir/
      person_001/
        img001.jpg
        img002.jpg
      person_002/
        img001.jpg
      ...
    """

    def __init__(self, data_dir: str, transform=None):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.samples = []
        self.class_to_idx = {}

        # Scan directory
        classes = sorted([
            d.name for d in self.data_dir.iterdir()
            if d.is_dir() and not d.name.startswith('.')
        ])

        for idx, class_name in enumerate(classes):
            self.class_to_idx[class_name] = idx
            class_dir = self.data_dir / class_name

            for img_path in class_dir.glob('*'):
                if img_path.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp'):
                    self.samples.append((str(img_path), idx))

        self.num_classes = len(classes)
        logger.info(
            f"Loaded dataset: {len(self.samples)} images, "
            f"{self.num_classes} identities"
        )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        img_path, label = self.samples[idx]

        try:
            img = Image.open(img_path).convert('RGB')
        except Exception as e:
            logger.warning(f"Failed to load {img_path}: {e}")
            # Return a blank image as fallback
            img = Image.new('RGB', (112, 112), (128, 128, 128))

        if self.transform:
            img = self.transform(img)
        else:
            # Default transform
            img = transforms.ToTensor()(img)

        return img, label


# ═══════════════════════════════════════════════════════════════════════════════
# DATA AUGMENTATION
# ═══════════════════════════════════════════════════════════════════════════════

def get_train_transforms() -> transforms.Compose:
    """
    Data augmentation pipeline for training.
    Designed for Indian demographic diversity:
    - Varied skin tones
    - Different lighting conditions (harsh sunlight, shadows)
    - Various accessories (glasses, bindis, turbans)
    """
    return transforms.Compose([
        transforms.Resize((120, 120)),
        transforms.RandomCrop((112, 112)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(
            brightness=0.4,    # Handle harsh sunlight / low light
            contrast=0.3,      # Handle shadows and mixed lighting
            saturation=0.3,    # Handle diverse skin tones
            hue=0.05,
        ),
        transforms.RandomGrayscale(p=0.1),
        transforms.RandomRotation(degrees=15),
        transforms.RandomPerspective(distortion_scale=0.2, p=0.3),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.5, 0.5, 0.5],
            std=[0.5, 0.5, 0.5]
        ),  # Normalize to [-1, 1]
        transforms.RandomErasing(p=0.2, scale=(0.02, 0.15)),
    ])


def get_val_transforms() -> transforms.Compose:
    """Validation/test transforms (no augmentation)."""
    return transforms.Compose([
        transforms.Resize((112, 112)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# TRAINING LOOP
# ═══════════════════════════════════════════════════════════════════════════════

class Trainer:
    """MobileFaceNet training orchestrator."""

    def __init__(self, args):
        self.args = args
        self.device = torch.device(
            'cuda' if torch.cuda.is_available() else 'cpu'
        )
        logger.info(f"Using device: {self.device}")

        # Dataset
        train_dataset = FaceDataset(
            args.data_dir, transform=get_train_transforms()
        )
        self.num_classes = train_dataset.num_classes

        self.train_loader = DataLoader(
            train_dataset,
            batch_size=args.batch_size,
            shuffle=True,
            num_workers=args.num_workers,
            pin_memory=True,
            drop_last=True,
        )

        # Model
        self.model = MobileFaceNet(embedding_dim=args.embedding_dim).to(self.device)
        self.criterion = ArcFaceLoss(
            embedding_dim=args.embedding_dim,
            num_classes=self.num_classes,
            s=args.arcface_s,
            m=args.arcface_m,
        ).to(self.device)

        # Optimizer
        self.optimizer = optim.SGD(
            list(self.model.parameters()) + list(self.criterion.parameters()),
            lr=args.lr,
            momentum=0.9,
            weight_decay=5e-4,
        )

        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.MultiStepLR(
            self.optimizer,
            milestones=[20, 35, 45],
            gamma=0.1,
        )

        # Output directory
        self.output_dir = Path(args.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Log model info
        total_params = sum(p.numel() for p in self.model.parameters())
        logger.info(f"Model parameters: {total_params:,} ({total_params/1e6:.2f}M)")
        logger.info(f"Number of classes: {self.num_classes}")

    def train_epoch(self, epoch: int) -> float:
        """Train for one epoch. Returns average loss."""
        self.model.train()
        self.criterion.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for batch_idx, (images, labels) in enumerate(self.train_loader):
            images = images.to(self.device)
            labels = labels.to(self.device)

            # Forward
            embeddings = self.model(images)
            logits = self.criterion(embeddings, labels)
            loss = F.cross_entropy(logits, labels)

            # Backward
            self.optimizer.zero_grad()
            loss.backward()
            # Gradient clipping for stability
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 5.0)
            self.optimizer.step()

            # Metrics
            total_loss += loss.item()
            _, predicted = logits.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

            if batch_idx % 100 == 0:
                acc = 100.0 * correct / total
                logger.info(
                    f"Epoch {epoch} [{batch_idx}/{len(self.train_loader)}] "
                    f"Loss: {loss.item():.4f} Acc: {acc:.2f}%"
                )

        avg_loss = total_loss / len(self.train_loader)
        accuracy = 100.0 * correct / total
        return avg_loss

    def save_checkpoint(self, epoch: int, loss: float):
        """Save model checkpoint."""
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'criterion_state_dict': self.criterion.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'loss': loss,
            'embedding_dim': self.args.embedding_dim,
            'num_classes': self.num_classes,
        }
        path = self.output_dir / f'mobilefacenet_epoch{epoch}.pth'
        torch.save(checkpoint, path)
        logger.info(f"Checkpoint saved: {path}")

        # Also save as 'best' if applicable
        best_path = self.output_dir / 'mobilefacenet_best.pth'
        torch.save(checkpoint, best_path)

    def train(self):
        """Full training loop."""
        logger.info("Starting training...")

        for epoch in range(1, self.args.epochs + 1):
            avg_loss = self.train_epoch(epoch)
            self.scheduler.step()

            current_lr = self.optimizer.param_groups[0]['lr']
            logger.info(
                f"Epoch {epoch}/{self.args.epochs} — "
                f"Loss: {avg_loss:.4f} LR: {current_lr:.6f}"
            )

            # Save checkpoint every 5 epochs
            if epoch % 5 == 0 or epoch == self.args.epochs:
                self.save_checkpoint(epoch, avg_loss)

        logger.info("Training complete!")
        logger.info(f"Best model saved to: {self.output_dir / 'mobilefacenet_best.pth'}")

        # Export to ONNX for conversion
        self.export_onnx()

    def export_onnx(self):
        """Export model to ONNX format for TFLite conversion."""
        self.model.eval()
        dummy_input = torch.randn(1, 3, 112, 112).to(self.device)
        onnx_path = self.output_dir / 'mobilefacenet.onnx'

        torch.onnx.export(
            self.model,
            dummy_input,
            str(onnx_path),
            input_names=['input'],
            output_names=['embedding'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'embedding': {0: 'batch_size'},
            },
            opset_version=13,
        )
        logger.info(f"ONNX model exported: {onnx_path}")


# ═══════════════════════════════════════════════════════════════════════════════
# LFW EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

def evaluate_lfw(model_path: str, lfw_dir: str, pairs_file: str,
                 embedding_dim: int = 128) -> dict:
    """
    Evaluate model accuracy on Labeled Faces in the Wild (LFW) benchmark.

    Args:
        model_path: Path to saved model checkpoint
        lfw_dir: Path to LFW dataset directory
        pairs_file: Path to LFW pairs.txt file
        embedding_dim: Embedding dimension

    Returns:
        Dictionary with accuracy, threshold, and other metrics
    """
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    # Load model
    model = MobileFaceNet(embedding_dim=embedding_dim).to(device)
    checkpoint = torch.load(model_path, map_location=device)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    transform = get_val_transforms()

    # Parse pairs file
    pairs = []
    with open(pairs_file, 'r') as f:
        for line in f.readlines()[1:]:  # Skip header
            parts = line.strip().split('\t')
            if len(parts) == 3:
                # Same person pair
                name, idx1, idx2 = parts
                pairs.append((name, int(idx1), name, int(idx2), True))
            elif len(parts) == 4:
                # Different person pair
                name1, idx1, name2, idx2 = parts
                pairs.append((name1, int(idx1), name2, int(idx2), False))

    logger.info(f"Loaded {len(pairs)} pairs for evaluation")

    # Generate embeddings and compare
    correct = 0
    total = 0
    similarities = []
    labels = []

    with torch.no_grad():
        for name1, idx1, name2, idx2, is_same in pairs:
            # Load images
            img1_path = os.path.join(
                lfw_dir, name1,
                f"{name1}_{idx1:04d}.jpg"
            )
            img2_path = os.path.join(
                lfw_dir, name2,
                f"{name2}_{idx2:04d}.jpg"
            )

            if not os.path.exists(img1_path) or not os.path.exists(img2_path):
                continue

            img1 = transform(Image.open(img1_path).convert('RGB')).unsqueeze(0).to(device)
            img2 = transform(Image.open(img2_path).convert('RGB')).unsqueeze(0).to(device)

            emb1 = model(img1)
            emb2 = model(img2)

            # Cosine similarity
            sim = F.cosine_similarity(emb1, emb2).item()
            similarities.append(sim)
            labels.append(1 if is_same else 0)
            total += 1

    # Find optimal threshold
    similarities = np.array(similarities)
    labels = np.array(labels)

    best_acc = 0
    best_threshold = 0

    for threshold in np.arange(0.0, 1.0, 0.01):
        predictions = (similarities >= threshold).astype(int)
        acc = np.mean(predictions == labels)
        if acc > best_acc:
            best_acc = acc
            best_threshold = threshold

    results = {
        'accuracy': best_acc,
        'threshold': best_threshold,
        'total_pairs': total,
        'mean_same_similarity': np.mean(similarities[labels == 1]),
        'mean_diff_similarity': np.mean(similarities[labels == 0]),
    }

    logger.info(f"LFW Results: Accuracy={best_acc:.4f}, Threshold={best_threshold:.3f}")
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def parse_args():
    parser = argparse.ArgumentParser(
        description='Train MobileFaceNet for NHAI Face Authentication'
    )
    parser.add_argument('--data_dir', type=str, required=True,
                        help='Path to face dataset directory')
    parser.add_argument('--output_dir', type=str, default='./output',
                        help='Output directory for checkpoints')
    parser.add_argument('--epochs', type=int, default=50,
                        help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=64,
                        help='Training batch size')
    parser.add_argument('--lr', type=float, default=0.01,
                        help='Initial learning rate')
    parser.add_argument('--embedding_dim', type=int, default=128,
                        help='Face embedding dimension')
    parser.add_argument('--arcface_s', type=float, default=64.0,
                        help='ArcFace scale factor')
    parser.add_argument('--arcface_m', type=float, default=0.50,
                        help='ArcFace margin')
    parser.add_argument('--num_workers', type=int, default=4,
                        help='DataLoader workers')
    parser.add_argument('--eval_lfw', type=str, default=None,
                        help='Path to LFW dataset for evaluation')
    parser.add_argument('--lfw_pairs', type=str, default=None,
                        help='Path to LFW pairs.txt file')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()

    if args.eval_lfw and args.lfw_pairs:
        # Evaluation mode
        results = evaluate_lfw(
            model_path=os.path.join(args.output_dir, 'mobilefacenet_best.pth'),
            lfw_dir=args.eval_lfw,
            pairs_file=args.lfw_pairs,
            embedding_dim=args.embedding_dim,
        )
        print("\n=== LFW Evaluation Results ===")
        for k, v in results.items():
            print(f"  {k}: {v}")
    else:
        # Training mode
        trainer = Trainer(args)
        trainer.train()
