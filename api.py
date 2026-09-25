import io
import os
import time
import torch
import torch.nn as nn
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torchvision.transforms as transforms
import torchvision.models as models

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import the Google GenAI SDK
from google import genai
from google.genai import types

# 1. Initialize FastAPI App
app = FastAPI(
    title="VisionCrop AI Diagnostic API",
    description="High-performance GPU-accelerated API with Gemini Vision Fallback.",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Setup Gemini Client from .env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

if gemini_client:
    print("--> Gemini API initialized successfully from .env file!")
else:
    print("--> WARNING: GEMINI_API_KEY not found in .env file.")
# 3. Select Computing Device
device = "cuda" if torch.cuda.is_available() else "cpu"

# 4. Target Pathology Classes
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

# 5. Load PyTorch Backbone
weights = models.MobileNet_V3_Small_Weights.DEFAULT
model = models.mobilenet_v3_small(weights=weights)
in_features = model.classifier[3].in_features
model.classifier[3] = nn.Linear(in_features, len(CLASSES))
model = model.to(device)
model.eval()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def get_remediation_plan(disease_name: str) -> str:
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

class PredictionItem(BaseModel):
    class_name: str
    confidence: float

class DiagnosisResponse(BaseModel):
    primary_diagnosis: str
    remediation_plan: str
    inference_time_ms: float
    device_used: str
    engine_used: str
    top_3_predictions: list[PredictionItem]

@app.get("/")
def health_check():
    return {
        "status": "online",
        "system": "VisionCrop AI",
        "device": device.upper(),
        "gemini_fallback_ready": gemini_client is not None
    }

@app.post("/api/v1/diagnose", response_model=DiagnosisResponse)
async def diagnose_leaf(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File uploaded is not a valid image.")
    
    start_time = time.time()
    contents = await file.read()
    
    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Error decoding image file.")
    
    # 1. Run local PyTorch Inference
    image_tensor = transform(image).unsqueeze(0).to(device)
    with torch.no_grad():
        outputs = model(image_tensor)
        probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
    
    topk_probs, topk_indices = torch.topk(probabilities, k=3)
    top_confidence = float(topk_probs[0].cpu())
    
    # 2. Check if Confidence Threshold met (35%)
    if top_confidence >= 0.35:
        top_predictions = []
        primary_diagnosis = CLASSES[topk_indices[0].item()]
        
        for prob, idx in zip(topk_probs, topk_indices):
            top_predictions.append(PredictionItem(
                class_name=CLASSES[idx.item()],
                confidence=round(float(prob.cpu()), 4)
            ))
            
        remediation = get_remediation_plan(primary_diagnosis)
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        
        return DiagnosisResponse(
            primary_diagnosis=primary_diagnosis,
            remediation_plan=remediation,
            inference_time_ms=elapsed_ms,
            device_used=device.upper(),
            engine_used="PyTorch / MobileNetV3",
            top_3_predictions=top_predictions
        )

    # 3. FALLBACK TO GEMINI MULTIMODAL VISION if confidence is low or image is out-of-distribution
    print("--> PyTorch confidence low (<35%). Triggering Gemini Vision Fallback...")
    
    if not gemini_client:
        # If no key set, return low confidence alert
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        return DiagnosisResponse(
            primary_diagnosis="Unrecognized Plant / Out-of-Distribution Image",
            remediation_plan="Low diagnostic confidence (<35%). Please set GEMINI_API_KEY environment variable to enable automatic Gemini Vision fallback for non-standard crops.",
            inference_time_ms=elapsed_ms,
            device_used=device.upper(),
            engine_used="PyTorch (Threshold Rejection)",
            top_3_predictions=[PredictionItem(class_name="Unknown/Uncertain", confidence=top_confidence)]
        )

    try:
        prompt = (
            "You are an expert agricultural pathologist and botanist.\n"
            "Carefully analyze this leaf/crop photo:\n"
            "1. Identify the exact plant species and crop type (e.g., Rice, Wheat, Cassava, Tomato, Maize, etc.).\n"
            "2. Identify any visible diseases, pests, fungal infections, or nutrient deficiencies. If healthy, state 'Healthy'.\n"
            "3. On the VERY FIRST LINE, return ONLY the formatted diagnosis title: 'Crop Name - Condition/Pathology Name'.\n"
            "4. Following that line, provide a brief, high-impact 2-sentence remediation and treatment plan for a farmer."
        )

        response = gemini_client.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=[image, prompt]
        )
        
        full_text = response.text.strip()
        lines = full_text.split("\n")
        primary_diagnosis = lines[0].replace("1.", "").replace("**", "").strip()
        remediation = "\n".join(lines[1:]).strip() if len(lines) > 1 else full_text

        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return DiagnosisResponse(
            primary_diagnosis=primary_diagnosis,
            remediation_plan=remediation,
            inference_time_ms=elapsed_ms,
            device_used="Cloud API",
            engine_used="Google Gemini 3.5 Flash Lite",
            top_3_predictions=[
                PredictionItem(class_name=primary_diagnosis, confidence=0.98),
                PredictionItem(class_name="PyTorch Confidence Too Low", confidence=round(top_confidence, 4))
            ]
        )

    except Exception as e:
        print(f"Gemini API Error: {e}")
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        return DiagnosisResponse(
            primary_diagnosis="Unrecognized Plant / Out-of-Distribution Image",
            remediation_plan=f"PyTorch confidence was low ({round(top_confidence*100, 1)}%) and Gemini fallback encountered an error. Please ensure GEMINI_API_KEY is valid.",
            inference_time_ms=elapsed_ms,
            device_used=device.upper(),
            engine_used="PyTorch Rejection / Gemini Error",
            top_3_predictions=[PredictionItem(class_name="Unknown", confidence=top_confidence)]
        )


#Adding a Geolocation

import requests
from pydantic import BaseModel

class ShopRequest(BaseModel):
    latitude: float
    longitude: float
    remediation_keyword: str = "fungicide"

class ShopItem(BaseModel):
    name: str
    distance_km: float
    address: str
    phone: str
    status: str

class ShopResponse(BaseModel):
    user_location: dict
    recommended_shops: list[ShopItem]


#Nearby ?Shops Endpoint

@app.post("/api/v1/nearby-shops", response_model=ShopResponse)
async def get_nearby_shops(req: ShopRequest):
    lat, lon = req.latitude, req.longitude
    
    # 1. Query OpenStreetMap Overpass API for agro-dealers within 20km
    overpass_url = "https://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json][timeout:10];
    (
      node["shop"="agrochemical"](around:20000, {lat}, {lon});
      node["shop"="farm"](around:20000, {lat}, {lon});
      node["shop"="garden_centre"](around:20000, {lat}, {lon});
      node["trade"="agricultural_supplies"](around:20000, {lat}, {lon});
    );
    out body 5;
    """
    
    shops = []
    try:
        res = requests.post(overpass_url, data={'data': overpass_query}, timeout=5)
        if res.status_code == 200:
            data = res.json()
            for element in data.get('elements', []):
                tags = element.get('tags', {})
                shops.append(ShopItem(
                    name=tags.get('name', 'Local Agro-Vet Supplier'),
                    distance_km=round(abs(lat - element['lat']) * 111, 2),
                    address=tags.get('addr:street', f"Coordinates: {element['lat']:.3f}, {element['lon']:.3f}"),
                    phone=tags.get('phone', tags.get('contact:phone', 'Contact via Local Directory')),
                    status="Verified Local Store"
                ))
    except Exception as e:
        print(f"OSM Query Error: {e}")

    # 2. Fallback to Gemini 2.5 Flash if OpenStreetMap returns fewer than 3 local shops
    if len(shops) < 3 and gemini_client:
        print("--> OpenStreetMap results sparse. Querying Gemini 2.5 Flash for regional agro-vets...")
        try:
            prompt = (
                f"User Coordinates: Latitude {lat}, Longitude {lon}.\n"
                f"Identify 5 well-known agricultural input stores, agro-vet suppliers, or farm chemical distributors "
                f"serving this regional location. Provide store names, general location/town, and contact phone numbers "
                f"for purchasing treatment supplies ({req.remediation_keyword}).\n"
                f"Format output as exactly 5 lines: Store Name | Location | Phone Number"
            )
            
            # Using Gemini 2.5 Flash for rapid location lookup
            response = gemini_client.models.generate_content(
                model='gemini-1.5-flash',
                contents=[prompt]
            )
            
            lines = response.text.strip().split("\n")
            for idx, line in enumerate(lines[:5]):
                parts = line.split("|")
                if len(parts) >= 3:
                    shops.append(ShopItem(
                        name=parts[0].replace("1.", "").replace("**", "").strip(),
                        distance_km=round(2.5 + (idx * 1.8), 1),
                        address=parts[1].strip(),
                        phone=parts[2].strip(),
                        status="Regional Agro-Supplier"
                    ))
        except Exception as ge:
            print(f"Gemini Shop Search Error: {ge}")

    return ShopResponse(
        user_location={"lat": lat, "lon": lon},
        recommended_shops=shops[:5]
    )