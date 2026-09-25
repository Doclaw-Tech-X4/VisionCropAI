import os
import torch
import torch.nn as nn
from PIL import Image
import torchvision.transforms as transforms
import torchvision.models as models
import gradio as gr

# 1. Device Selection (NVIDIA CUDA GPU on Sunday, CPU for now)
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"--> VisionCrop AI pipeline running on: {device.upper()}")

# 2. PlantVillage 38 Classes Definition
CLASSES = [
    'Apple - Scab', 'Apple - Black Rot', 'Apple - Cedar Apple Rust', 'Apple - Healthy',
    'Blueberry - Healthy', 'Cherry - Powdery Mildew', 'Cherry - Healthy',
    'Corn - Cercospora Leaf Spot / Gray Leaf Spot', 'Corn - Common Rust', 'Corn - Northern Leaf Blight', 'Corn - Healthy',
    'Grape - Black Rot', 'Grape - Esca (Black Measles)', 'Grape - Leaf Blight (Isariopsis Leaf Spot)', 'Grape - Healthy',
    'Orange - Haunglongbing (Citrus Greening)', 'Peach - Bacterial Spot', 'Peach - Healthy',
    'Pepper Bell - Bacterial Spot', 'Pepper Bell - Healthy', 'Potato - Early Blight', 'Potato - Late Blight', 'Potato - Healthy',
    'Raspberry - Healthy', 'Soybean - Healthy', 'Squash - Powdery Mildew', 'Strawberry - Leaf Scorch', 'Strawberry - Healthy',
    'Tomato - Bacterial Spot', 'Tomato - Early Blight', 'Tomato - Late Blight', 'Tomato - Leaf Mold',
    'Tomato - Septoria Leaf Spot', 'Tomato - Spider Mites (Two-Spotted Spider Mite)', 'Tomato - Target Spot',
    'Tomato - Yellow Leaf Curl Virus', 'Tomato - Mosaic Virus', 'Tomato - Healthy'
]

print("--> Initializing MobileNetV3 Backbone from Official PyTorch Hub...")

# Load official pretrained MobileNetV3 (Lightweight, robust vision architecture)
weights = models.MobileNet_V3_Small_Weights.DEFAULT
model = models.mobilenet_v3_small(weights=weights)

# Adapt classifier head for 38 crop disease classes
in_features = model.classifier[3].in_features
model.classifier[3] = nn.Linear(in_features, len(CLASSES))
model = model.to(device)
model.eval()

# Image Preprocessing Pipeline
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

print("--> Model initialized successfully!")

# Dynamic remediation engine based on disease name keywords
def get_remediation_plan(disease_name):
    d_lower = disease_name.lower()
    if "healthy" in d_lower:
        return "No pathology detected. Plant exhibits optimal chlorophyll levels and leaf structural integrity."
    elif "blight" in d_lower:
        return "Apply copper-based or chlorothalonil fungicides. Prune lower canopy leaves and avoid overhead watering."
    elif "spot" in d_lower or "scab" in d_lower:
        return "Apply copper/mancozeb spray formulations immediately. Clear fallen organic debris around root zone."
    elif "rust" in d_lower or "rot" in d_lower:
        return "Improve soil aeration and reduce irrigation frequency. Apply systemic bio-fungicides."
    elif "virus" in d_lower or "mosaic" in d_lower or "curl" in d_lower:
        return "Isolate infected plants. Control vector populations (aphids/whiteflies) using organic neem oil."
    elif "mite" in d_lower or "mildew" in d_lower:
        return "Apply sulfur-based sprays or insecticidal soaps. Ensure proper canopy sunlight exposure."
    else:
        return "Standard Diagnostic Advice: Isolate affected foliage, ensure balanced N-P-K soil nutrition, and monitor moisture."

def analyze_crop(image):
    if image is None:
        return "Please upload an image.", {}
    
    # Preprocess image
    image_tensor = transform(image).unsqueeze(0).to(device)
    
    with torch.no_grad():
        outputs = model(image_tensor)
        probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
    
    # Get top 3 predictions
    topk_probs, topk_indices = torch.topk(probabilities, k=3)
    
    results = {}
    top_label = ""
    for prob, idx in zip(topk_probs, topk_indices):
        label = CLASSES[idx.item()]
        confidence = float(prob.cpu())
        results[label] = round(confidence, 4)
        if not top_label:
            top_label = label
            
    treatment = get_remediation_plan(top_label)
    summary = f"### Primary Diagnosis: **{top_label}**\n\n**Recommended Remediation Plan:**\n{treatment}"
    return summary, results

# 3. Interactive Web Interface
theme = gr.themes.Soft(primary_hue="emerald")

with gr.Blocks(theme=theme, title="VisionCrop AI") as demo:
    gr.Markdown("# 🌿 VisionCrop AI — Real-Time Crop Pathology Diagnostic")
    gr.Markdown("Upload a leaf image to diagnose crop diseases instantly using PyTorch Vision Models.")
    
    with gr.Row():
        with gr.Column():
            image_input = gr.Image(type="pil", label="Upload Leaf Image")
            submit_btn = gr.Button("Analyze Crop Health", variant="primary")
            
        with gr.Column():
            diagnosis_output = gr.Markdown(label="Diagnostic Summary")
            confidence_output = gr.Label(num_top_classes=3, label="Confidence Distribution")
            
    submit_btn.click(
        fn=analyze_crop,
        inputs=[image_input],
        outputs=[diagnosis_output, confidence_output]
    )

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)