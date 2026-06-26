import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, Camera, AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, ChevronRight, LogOut, User, History, Plus, Download, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { cn } from './lib/utils';
import { AnalysisResult } from './types';
import Auth from './components/Auth';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [history, setHistory] = useState<any[]>([]);

  const [isFindingDerma, setIsFindingDerma] = useState(false);
  const [nearbyDermas, setNearbyDermas] = useState<any[]>([]);

  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const findDermatologists = async () => {
    setIsFindingDerma(true);
    setError(null);
    setNearbyDermas([]);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      const { latitude, longitude } = position.coords;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find 3 highly-rated dermatologists near latitude ${latitude}, longitude ${longitude}. Provide their names, addresses, and why they are recommended.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude, longitude }
            }
          }
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const dermas = chunks
          .filter((chunk: any) => chunk.maps)
          .map((chunk: any) => ({
            title: chunk.maps.title,
            uri: chunk.maps.uri
          }));
        setNearbyDermas(dermas);
      }
    } catch (err) {
      console.error("Failed to find dermatologists:", err);
      setError("Could not access your location or find nearby clinics. Please check your browser permissions.");
    } finally {
      setIsFindingDerma(false);
    }
  };

  const [isSavingReport, setIsSavingReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const saveReport = async () => {
    if (!result || !reportRef.current) {
      console.error("Missing result or reportRef");
      return;
    }
    
    setIsSavingReport(true);
    setError(null);
    
    try {
      const element = reportRef.current;
      const fileName = `DermScan_Report_${result.conditionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

      const opt = {
        margin: 10,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true,
          logging: false
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      // Use html2pdf for more reliable generation
      await html2pdf().set(opt).from(element).save();
      
      console.log("PDF saved successfully:", fileName);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      // Fallback to text report if PDF fails
      saveTextReport();
      setError("PDF generation failed, so we've downloaded a text version instead. This can happen if the image is too large or your browser blocks the download.");
    } finally {
      setIsSavingReport(false);
    }
  };

  const saveTextReport = () => {
    if (!result) return;
    
    const reportText = `
DERMSCAN AI - ANALYSIS REPORT
Generated on: ${new Date().toLocaleString()}
User: ${user.name}

CONDITION: ${result.conditionName}
CONFIDENCE: ${(result.confidence * 100).toFixed(0)}%
URGENCY: ${result.urgency}

DESCRIPTION:
${result.description}

SYMPTOMS:
${result.symptoms.map(s => `- ${s}`).join('\n')}

RECOMMENDATIONS:
${result.recommendations.map(r => `- ${r}`).join('\n')}

DISCLAIMER:
${result.disclaimer}
    `;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DermScan_Report_${result.conditionName.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('dermscan_token');
    const savedUser = localStorage.getItem('dermscan_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setIsAuthReady(true);
  }, []);

  useEffect(() => {
    if (token && activeTab === 'history') {
      fetchHistory();
    }
  }, [token, activeTab]);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/scans', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const handleAuthSuccess = (userData: any, userToken: string) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('dermscan_token', userToken);
    localStorage.setItem('dermscan_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('dermscan_token');
    localStorage.removeItem('dermscan_user');
    reset();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const base64Data = image.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: `You are a professional dermatological assistant. Analyze the provided skin image and identify potential conditions. 
                Return the response in JSON format with the following structure:
                {
                  "conditionName": "Name of the condition",
                  "confidence": 0.0 to 1.0,
                  "description": "A brief overview of the condition",
                  "symptoms": ["symptom 1", "symptom 2"],
                  "recommendations": ["advice 1", "advice 2"],
                  "urgency": "Low" | "Moderate" | "High" | "Emergency",
                  "disclaimer": "A mandatory medical disclaimer"
                }
                
                Be precise and professional. If the image is not of skin or is too blurry, indicate that in the description and set confidence to 0.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              conditionName: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              description: { type: Type.STRING },
              symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              urgency: { type: Type.STRING, enum: ["Low", "Moderate", "High", "Emergency"] },
              disclaimer: { type: Type.STRING }
            },
            required: ["conditionName", "confidence", "description", "symptoms", "recommendations", "urgency", "disclaimer"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}') as AnalysisResult;
      setResult(data);

      // Save to history
      await fetch('/api/scans', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...data,
          imageData: image
        })
      });

    } catch (err) {
      console.error("Analysis failed:", err);
      setError("Failed to analyze the image. Please try again with a clearer photo.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  if (!isAuthReady) return null;

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Camera size={20} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">DermScan AI</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
              <button 
                onClick={() => setActiveTab('new')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                  activeTab === 'new' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <Plus size={14} /> New Scan
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                  activeTab === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <History size={14} /> History
              </button>
            </nav>

            <div className="hidden md:flex items-center gap-3 pl-6 border-l border-gray-100">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                <User size={16} />
              </div>
              <div className="text-sm">
                <p className="font-bold text-gray-900 leading-none">{user.name}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Active Session</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {activeTab === 'new' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* ... (existing new scan UI) */}
          
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-8">
            <section className="space-y-4">
              <h2 className="text-3xl font-light tracking-tight text-gray-900">
                Skin Condition <span className="font-semibold">Analysis</span>
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Upload a clear image of the affected skin area for an instant AI-powered preliminary assessment.
              </p>
            </section>

            <div 
              className={cn(
                "relative aspect-square rounded-3xl border-2 border-dashed transition-all duration-300 overflow-hidden flex flex-col items-center justify-center bg-white group",
                image ? "border-blue-500 shadow-xl" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
              )}
              onClick={() => !image && fileInputRef.current?.click()}
            >
              {image ? (
                <>
                  <img 
                    src={image} 
                    alt="Skin area" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); reset(); }}
                      className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40 transition-colors"
                    >
                      <RefreshCw size={24} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Upload size={32} />
                  </div>
                  <p className="font-medium text-gray-900">Drop image here</p>
                  <p className="text-sm text-gray-400 mt-1">or click to browse</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                className="hidden" 
                accept="image/*"
              />
            </div>

            {image && !result && !isAnalyzing && (
              <button
                onClick={analyzeImage}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Analyze Image
                <ChevronRight size={20} />
              </button>
            )}

            {isAnalyzing && (
              <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl font-semibold flex items-center justify-center gap-3">
                <Loader2 className="animate-spin" size={20} />
                Processing Analysis...
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3 text-red-700 text-sm">
                <AlertCircle className="shrink-0" size={18} />
                <p>{error}</p>
              </div>
            )}

            <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4">
              <Info className="text-amber-600 shrink-0" size={20} />
              <div className="text-xs text-amber-800 leading-relaxed">
                <p className="font-bold mb-1 uppercase tracking-wider">Medical Disclaimer</p>
                This tool provides AI-generated analysis for informational purposes only. It is not a medical diagnosis. Always consult with a qualified healthcare professional for medical concerns.
              </div>
            </div>

            <section className="pt-8 border-t border-gray-200">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Commonly Detected</h4>
              <div className="grid grid-cols-2 gap-3">
                {['Acne', 'Eczema', 'Psoriasis', 'Melanoma', 'Ringworm', 'Rosacea'].map((disease) => (
                  <div key={disease} className="px-4 py-3 bg-white border border-gray-100 rounded-xl text-sm font-medium text-gray-600 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {disease}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7">
            {!result && !isAnalyzing ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-gray-200 rounded-3xl bg-white/50">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-300 mb-6">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-xl font-medium text-gray-400">Analysis Results</h3>
                <p className="text-gray-400 mt-2 max-w-xs">Upload and analyze an image to see detailed findings here.</p>
              </div>
            ) : result ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Result Card */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-8 border-b border-gray-50">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 inline-block",
                          result.urgency === 'Low' ? "bg-green-100 text-green-700" :
                          result.urgency === 'Moderate' ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          Urgency: {result.urgency}
                        </span>
                        <h3 className="text-4xl font-bold tracking-tight text-gray-900">{result.conditionName}</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Confidence</div>
                        <div className="text-3xl font-light text-blue-600">{(result.confidence * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                    <p className="text-gray-600 leading-relaxed text-lg">{result.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-8 border-r border-gray-50">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Info size={14} /> Key Symptoms
                      </h4>
                      <ul className="space-y-3">
                        {result.symptoms.map((symptom, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                            {symptom}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-8">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <CheckCircle2 size={14} /> Recommendations
                      </h4>
                      <ul className="space-y-3">
                        {result.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-100">
                  <h4 className="text-lg font-semibold mb-2">Next Steps</h4>
                  <p className="text-blue-100 text-sm leading-relaxed mb-6">
                    While our AI provides a high-confidence assessment, skin conditions can be complex. We recommend scheduling an appointment with a board-certified dermatologist for a clinical evaluation.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={findDermatologists}
                      disabled={isFindingDerma}
                      className="px-6 py-3 bg-white text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isFindingDerma ? <Loader2 className="animate-spin" size={16} /> : null}
                      Find a Dermatologist
                    </button>
                    <button 
                      onClick={saveReport}
                      disabled={isSavingReport}
                      className="px-6 py-3 bg-blue-500 text-white rounded-xl text-sm font-bold hover:bg-blue-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSavingReport ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                      Save Report (PDF)
                    </button>
                  </div>

                  {nearbyDermas.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-blue-500/30 animate-in fade-in slide-in-from-top-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest mb-4">Nearby Clinics</h5>
                      <div className="grid grid-cols-1 gap-3">
                        {nearbyDermas.map((derma, i) => (
                          <a 
                            key={i} 
                            href={derma.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-4 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-between group transition-all"
                          >
                            <span className="font-medium">{derma.title}</span>
                            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : isAnalyzing && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-8 border border-gray-100 animate-pulse">
                  <div className="h-8 w-48 bg-gray-100 rounded-lg mb-6" />
                  <div className="space-y-3">
                    <div className="h-4 w-full bg-gray-50 rounded" />
                    <div className="h-4 w-full bg-gray-50 rounded" />
                    <div className="h-4 w-3/4 bg-gray-50 rounded" />
                  </div>
                  <div className="grid grid-cols-2 gap-8 mt-12">
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                      <div className="h-4 w-full bg-gray-50 rounded" />
                      <div className="h-4 w-full bg-gray-50 rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                      <div className="h-4 w-full bg-gray-50 rounded" />
                      <div className="h-4 w-full bg-gray-50 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section className="space-y-4">
              <h2 className="text-3xl font-light tracking-tight text-gray-900">
                Scan <span className="font-semibold">History</span>
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Review your previous dermatological assessments and track changes over time.
              </p>
            </section>

            {history.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-gray-100 text-center space-y-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
                  <History size={32} />
                </div>
                <p className="text-gray-400 font-medium">No scan history found.</p>
                <button 
                  onClick={() => setActiveTab('new')}
                  className="text-blue-600 font-bold text-sm hover:underline"
                >
                  Start your first scan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {history.map((scan) => (
                  <div 
                    key={scan.id} 
                    className="bg-white rounded-3xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all group cursor-pointer"
                    onClick={() => {
                      setResult({
                        conditionName: scan.condition_name,
                        confidence: scan.confidence,
                        description: scan.description,
                        symptoms: scan.symptoms,
                        recommendations: scan.recommendations,
                        urgency: scan.urgency,
                        disclaimer: "Historical record"
                      });
                      setImage(scan.image_data);
                      setActiveTab('new');
                    }}
                  >
                    <div className="aspect-video relative overflow-hidden">
                      <img 
                        src={scan.image_data} 
                        alt={scan.condition_name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm",
                          scan.urgency === 'Low' ? "bg-green-500 text-white" :
                          scan.urgency === 'Moderate' ? "bg-yellow-500 text-white" :
                          "bg-red-500 text-white"
                        )}>
                          {scan.urgency}
                        </span>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-xl font-bold text-gray-900">{scan.condition_name}</h4>
                        <span className="text-blue-600 font-bold text-sm">{(scan.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                        {new Date(scan.created_at).toLocaleDateString(undefined, { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Camera size={16} />
            <span className="text-sm font-semibold">DermScan AI</span>
          </div>
          <div className="flex gap-8 text-xs font-medium text-gray-400 uppercase tracking-widest">
            <a href="#" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>

      {/* Hidden Report Template for PDF Generation */}
      {result && (
        <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '800px', pointerEvents: 'none' }}>
          <div 
            ref={reportRef}
            style={{ backgroundColor: 'white', padding: '48px', color: '#1a1a1a', fontFamily: 'sans-serif' }}
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-blue-600 pb-8 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
                    <Camera size={20} />
                  </div>
                  <span className="text-2xl font-bold tracking-tight">DermScan AI</span>
                </div>
                <p className="text-gray-400 text-sm uppercase tracking-widest font-bold">Analysis Report</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">{new Date().toLocaleDateString()}</p>
                <p className="text-xs text-gray-400">Report ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
              </div>
            </div>

            {/* Patient Info */}
            <div className="grid grid-cols-2 gap-8 mb-12 bg-gray-50 p-6 rounded-2xl">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Patient Name</p>
                <p className="text-lg font-semibold">{user.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assessment Type</p>
                <p className="text-lg font-semibold">AI Dermatological Scan</p>
              </div>
            </div>

            {/* Main Result */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-4xl font-bold text-gray-900">{result.conditionName}</h2>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">AI Confidence</p>
                  <p className="text-3xl font-light text-blue-600">{(result.confidence * 100).toFixed(0)}%</p>
                </div>
              </div>
              
              <div className={cn(
                "inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6",
                result.urgency === 'Low' ? "bg-green-100 text-green-700" :
                result.urgency === 'Moderate' ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              )}>
                Urgency Level: {result.urgency}
              </div>

              <p className="text-gray-600 leading-relaxed text-lg mb-8">
                {result.description}
              </p>
            </div>

            {/* Symptoms & Recommendations */}
            <div className="grid grid-cols-2 gap-12 mb-12">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info size={14} /> Identified Symptoms
                </h3>
                <ul className="space-y-3">
                  {result.symptoms.map((symptom, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      {symptom}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <CheckCircle2 size={14} /> Recommendations
                </h3>
                <ul className="space-y-3">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Image Context */}
            {image && (
              <div className="mb-12">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Analyzed Image</h3>
                <div className="rounded-2xl overflow-hidden border border-gray-100 h-64">
                  <img 
                    src={image} 
                    alt="Analyzed skin" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            )}

            {/* Footer / Disclaimer */}
            <div className="mt-auto pt-8 border-t border-gray-100">
              <div className="p-6 bg-amber-50 rounded-2xl">
                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Medical Disclaimer</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  {result.disclaimer} This report is generated by an artificial intelligence system and is intended for informational purposes only. It does not constitute a medical diagnosis, professional advice, or a treatment plan. Always seek the advice of a physician or other qualified health provider with any questions you may have regarding a medical condition.
                </p>
              </div>
              <p className="text-center text-[10px] text-gray-300 mt-8 uppercase tracking-[0.2em]">
                Generated by DermScan AI • Secure Analysis Report
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
