"""Compatibility shim: torch.nn.RMSNorm only exists in torch >= 2.4, but the last
torch build for Intel macOS is 2.2.2. Import this module BEFORE importing timesfm3."""
import torch
import torch.nn as nn

if not hasattr(nn, "RMSNorm"):

    class RMSNorm(nn.Module):
        def __init__(self, normalized_shape, eps=None, elementwise_affine=True, device=None, dtype=None):
            super().__init__()
            if isinstance(normalized_shape, int):
                normalized_shape = (normalized_shape,)
            self.normalized_shape = tuple(normalized_shape)
            self.eps = eps
            self.elementwise_affine = elementwise_affine
            if elementwise_affine:
                self.weight = nn.Parameter(torch.ones(self.normalized_shape, device=device, dtype=dtype))
            else:
                self.register_parameter("weight", None)

        def forward(self, x):
            eps = torch.finfo(x.dtype).eps if self.eps is None else self.eps
            dims = tuple(range(-len(self.normalized_shape), 0))
            out = x * torch.rsqrt(x.pow(2).mean(dim=dims, keepdim=True) + eps)
            if self.weight is not None:
                out = out * self.weight
            return out

    nn.RMSNorm = RMSNorm
