#!/bin/bash
echo "=== Deploying VisionCrop AI on NVIDIA Brev GPU Cluster ==="

# Check CUDA Availability
python3 -c "import torch; print('--> CUDA Available:', torch.cuda.is_available()); print('--> Device Count:', torch.cuda.device_count())"

# Install Dependencies
pip install -r requirements.txt

# Start FastAPI App with Uvicorn in Background
echo "--> Starting FastAPI GPU Server..."
nohup uvicorn api:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

echo "--> Deployment Complete! Server running on GPU."
echo "--> Check logs with: tail -f server.log"
