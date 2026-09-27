import React, { useState, useEffect, useRef } from 'react';
import {
    Camera, Upload, Volume2, MapPin, Cpu, CheckCircle2,
    AlertTriangle, RefreshCw, Printer, ShieldCheck, Zap
} from 'lucide-react';

const API_URL = "http://localhost:8000";

export default function App() {
    const [backendStatus, setBackendStatus] = useState({ online: false, device: '...', gpu: '...', vram: 0 });
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'webcam'
    const [selectedFile, setSelectedFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Diagnostic Output State
    const [diagnosticResult, setDiagnosticResult] = useState(null);

    // Webcam States
    const [isCameraActive, setIsCameraActive] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    // Shop Finder States
    const [isFindingShops, setIsFindingShops] = useState(false);
    const [shops, setShops] = useState([]);
    const [shopError, setShopError] = useState(null);

    // Check Backend Health
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await fetch(`${API_URL}/`);
                if (res.ok) {
                    const data = await res.json();
                    setBackendStatus({
                        online: true,
                        device: data.device,
                        gpu: data.gpu_model,
                        vram: data.vram_allocated_mb
                    });
                } else {
                    setBackendStatus({ online: false, device: 'OFFLINE', gpu: 'N/A', vram: 0 });
                }
            } catch (e) {
                setBackendStatus({ online: false, device: 'OFFLINE', gpu: 'N/A', vram: 0 });
            }
        };
        checkHealth();
        const interval = setInterval(checkHealth, 10000);
        return () => clearInterval(interval);
    }, []);

    // Handle File Selection
    const handleFileChange = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        setSelectedFile(file);
        setImagePreview(URL.createObjectURL(file));
        runDiagnostic(file);
    };

    // Run Diagnosis API
    const runDiagnostic = async (fileToUpload) => {
        setIsAnalyzing(true);
        setShops([]);
        setShopError(null);
        const formData = new FormData();
        formData.append('file', fileToUpload);

        try {
            const res = await fetch(`${API_URL}/api/v1/diagnose`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error("Diagnostic failed");
            const data = await res.json();
            setDiagnosticResult(data);
        } catch (err) {
            console.error(err);
            alert("Error connecting to FastAPI backend. Ensure uvicorn main:app is running.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Start Live Webcam
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'environment' }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsCameraActive(true);
        } catch (err) {
            alert("Camera access denied or unavailable.");
        }
    };

    // Stop Live Webcam
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
    };

    // Capture Webcam Frame
    const captureFrame = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            const capturedFile = new File([blob], "webcam_frame.jpg", { type: "image/jpeg" });
            setImagePreview(URL.createObjectURL(blob));
            setSelectedFile(capturedFile);
            runDiagnostic(capturedFile);
        }, 'image/jpeg', 0.95);
    };

    // Web Speech API Readout
    const speakDiagnosis = (text) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        } else {
            alert("Text-to-speech is not supported on this browser.");
        }
    };

    // Fetch Geo-located Agro-Dealers
    const fetchNearbyShops = () => {
        setIsFindingShops(true);
        setShopError(null);

        if (!navigator.geolocation) {
            setShopError("Geolocation is not supported by your browser.");
            setIsFindingShops(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await fetch(`${API_URL}/api/v1/nearby-shops`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        remediation_keyword: diagnosticResult?.primary_diagnosis || "insecticide"
                    })
                });
                if (!res.ok) throw new Error("Shop search failed");
                const data = await res.json();
                setShops(data.recommended_shops || []);
            } catch (e) {
                setShopError("Could not retrieve nearby stores. Please check backend API.");
            } finally {
                setIsFindingShops(false);
            }
        }, (err) => {
            setShopError(`GPS Permission Denied: ${err.message}`);
            setIsFindingShops(false);
        });
    };

    // Load Preset Examples
    const loadPreset = (type) => {
        setActiveTab('upload');
        stopCamera();
        const canvas = document.createElement('canvas');
        canvas.width = 224; canvas.height = 224;
        const ctx = canvas.getContext('2d');

        if (type === 'tomato') {
            ctx.fillStyle = '#2d5a27'; ctx.fillRect(0, 0, 224, 224);
            ctx.fillStyle = '#1c1b18'; ctx.beginPath(); ctx.arc(100, 100, 45, 0, 2 * Math.PI); ctx.fill();
        } else if (type === 'corn') {
            ctx.fillStyle = '#4a7c59'; ctx.fillRect(0, 0, 224, 224);
            ctx.fillStyle = '#8b4513'; ctx.fillRect(40, 20, 15, 180);
        } else {
            ctx.fillStyle = '#3b6e4c'; ctx.fillRect(0, 0, 224, 224);
            ctx.fillStyle = '#553311'; ctx.beginPath(); ctx.arc(130, 110, 35, 0, 2 * Math.PI); ctx.fill();
        }

        canvas.toBlob((blob) => {
            const file = new File([blob], `${type}_preset.jpg`, { type: "image/jpeg" });
            handleFileChange(file);
        }, 'image/jpeg');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">

            {/* Top Navigation */}
            <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-4 no-print">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <span className="text-2xl">🌿</span>
                        <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                            VisionCrop AI
                        </span>
                        <span className="text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-700 px-2.5 py-0.5 rounded-full font-medium">
                            NVIDIA Brev Accelerated
                        </span>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2 text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full">
                            <span className={`h-2.5 w-2.5 rounded-full ${backendStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                            <span className="text-slate-300 font-mono">
                                {backendStatus.online ? `FastAPI (${backendStatus.device})` : 'Backend Offline'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Grid */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Column: Image Source & Presets */}
                <section className="lg:col-span-5 space-y-6 no-print">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Camera className="w-5 h-5 text-emerald-400" /> Image Input
                            </h2>
                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                                <button
                                    onClick={() => { setActiveTab('upload'); stopCamera(); }}
                                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${activeTab === 'upload' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                    File Upload
                                </button>
                                <button
                                    onClick={() => setActiveTab('webcam')}
                                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${activeTab === 'webcam' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                    Live Webcam
                                </button>
                            </div>
                        </div>

                        {/* File Upload Mode */}
                        {activeTab === 'upload' && (
                            <div className="space-y-3">
                                <p className="text-xs text-slate-400">
                                    Drag & drop or select a leaf photo to analyze crop pathology.
                                </p>
                                <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500 bg-slate-950/50 hover:bg-emerald-950/10 transition-all rounded-xl p-6 text-center cursor-pointer flex flex-col items-center justify-center min-h-[220px] relative">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                                        className="hidden"
                                    />
                                    {!imagePreview ? (
                                        <div className="space-y-3">
                                            <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                                                <Upload className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-200">Click or Drag Leaf Image</p>
                                                <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, WEBP</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={imagePreview} alt="Preview" className="max-h-[260px] w-auto rounded-lg object-contain shadow-md" />
                                    )}
                                </label>
                            </div>
                        )}

                        {/* Webcam Mode */}
                        {activeTab === 'webcam' && (
                            <div className="space-y-4">
                                <p className="text-xs text-slate-400">Point your device camera at a leaf frame.</p>
                                <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-video flex items-center justify-center">
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                                    <canvas ref={canvasRef} className="hidden"></canvas>
                                    {!isCameraActive && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-500 text-xs space-y-2">
                                            <Camera className="w-8 h-8 text-slate-600" />
                                            <span>Camera inactive. Click "Start Camera" below.</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex space-x-3">
                                    {!isCameraActive ? (
                                        <button onClick={startCamera} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold transition-all">
                                            Start Camera
                                        </button>
                                    ) : (
                                        <button onClick={stopCamera} className="flex-1 py-2.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 rounded-xl text-xs font-semibold transition-all">
                                            Stop Camera
                                        </button>
                                    )}
                                    <button
                                        onClick={captureFrame}
                                        disabled={!isCameraActive}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all">
                                        Capture & Analyze
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Presets */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" /> Instant Evaluation Presets
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => loadPreset('tomato')} className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-all">
                                <div class="text-xs font-bold text-emerald-400">Tomato</div>
                                <div class="text-[11px] text-slate-400">Late Blight</div>
                            </button>
                            <button onClick={() => loadPreset('corn')} className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-all">
                                <div class="text-xs font-bold text-amber-400">Corn / Maize</div>
                                <div class="text-[11px] text-slate-400">Common Rust</div>
                            </button>
                            <button onClick={() => loadPreset('potato')} className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-all">
                                <div class="text-xs font-bold text-cyan-400">Potato</div>
                                <div class="text-[11px] text-slate-400">Early Blight</div>
                            </button>
                        </div>
                    </div>
                </section>

                {/* Right Column: Diagnostic Output & Telemetry */}
                <section className="lg:col-span-7 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl min-h-[320px] flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-emerald-400" /> Diagnostic Output
                                </h2>
                                {diagnosticResult && (
                                    <span className="text-xs font-mono bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-1 rounded-md">
                                        Latency: {diagnosticResult.inference_time_ms} ms ({diagnosticResult.device_used})
                                    </span>
                                )}
                            </div>

                            {isAnalyzing ? (
                                <div className="flex items-center space-x-3 text-emerald-400 py-12 justify-center">
                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                    <span className="text-sm font-medium">Running Vision Transformer Diagnostic...</span>
                                </div>
                            ) : diagnosticResult ? (
                                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">Primary Pathology</span>
                                            <h3 className="text-xl font-bold text-white mt-0.5">{diagnosticResult.primary_diagnosis}</h3>
                                        </div>

                                        {/* Speech Readout & Print Buttons */}
                                        <div className="flex space-x-2 no-print">
                                            <button
                                                onClick={() => speakDiagnosis(`${diagnosticResult.primary_diagnosis}. Remediation: ${diagnosticResult.remediation_plan}`)}
                                                className="p-2 bg-slate-800 hover:bg-emerald-900/60 border border-slate-700 rounded-lg text-emerald-300 transition-all"
                                                title="Read Diagnosis Aloud">
                                                <Volume2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => window.print()}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-all"
                                                title="Print Diagnostic Report">
                                                <Printer className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="text-sm text-slate-300 leading-relaxed">
                                        <strong className="text-emerald-400 block mb-1">Recommended Remediation Plan:</strong>
                                        <span>{diagnosticResult.remediation_plan}</span>
                                    </div>

                                    {/* Find Nearby Shops Trigger */}
                                    <div className="pt-3 border-t border-slate-900 no-print">
                                        <button
                                            onClick={fetchNearbyShops}
                                            disabled={isFindingShops}
                                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/50">
                                            <MapPin className="w-4 h-4" />
                                            {isFindingShops ? "Locating GPS position..." : "Find Nearby Agro-Vet Stores & Medicine Supplies"}
                                        </button>

                                        {shopError && <p className="text-xs text-red-400 mt-2">{shopError}</p>}

                                        {shops.length > 0 && (
                                            <div className="mt-4 space-y-2">
                                                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recommended Local Agro-Suppliers</h5>
                                                {shops.map((s, idx) => (
                                                    <div key={idx} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                                                        <div>
                                                            <div className="font-bold text-white">{s.name}</div>
                                                            <div className="text-slate-400 text-[11px] mt-0.5">{s.address} ({s.distance_km} km)</div>
                                                            <div className="text-emerald-400 font-mono text-[11px] mt-0.5">📞 {s.phone}</div>
                                                        </div>
                                                        <span className="text-[10px] bg-slate-800 text-emerald-300 px-2 py-1 rounded-md border border-slate-700">
                                                            {s.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <span className="text-3xl block mb-2">🍃</span>
                                    <p className="text-sm">Upload a leaf photo, use the webcam, or pick a preset to view analysis.</p>
                                </div>
                            )}
                        </div>

                        {/* Confidence Meters */}
                        {diagnosticResult && (
                            <div className="mt-4 border-t border-slate-800 pt-4">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                                    Confidence Distribution
                                </h4>
                                <div className="space-y-3">
                                    {diagnosticResult.top_3_predictions.map((item, idx) => {
                                        const percentage = (item.confidence * 100).toFixed(1);
                                        return (
                                            <div key={idx} className="space-y-1">
                                                <div className="flex justify-between text-xs text-slate-300">
                                                    <span>{item.class_name}</span>
                                                    <span className="font-mono text-emerald-400">{percentage}%</span>
                                                </div>
                                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                                    <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Telemetry Cards */}
                    <div className="grid grid-cols-3 gap-4 no-print">
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                            <div className="text-xs text-slate-400">Inference Engine</div>
                            <div className="text-sm font-bold text-emerald-400 mt-1">
                                {diagnosticResult?.engine_used || "PyTorch / MobileNetV3"}
                            </div>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                            <div className="text-xs text-slate-400">GPU Hardware Telemetry</div>
                            <div className="text-xs font-mono text-slate-200 mt-1 truncate">
                                {backendStatus.gpu}
                            </div>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                            <div className="text-xs text-slate-400">VRAM Allocated</div>
                            <div className="text-sm font-bold text-slate-200 mt-1">
                                {backendStatus.vram} MB
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}