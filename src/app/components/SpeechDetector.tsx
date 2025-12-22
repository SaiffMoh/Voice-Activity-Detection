'use client';

import { useEffect, useState, useRef } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function SpeechDetector() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const vadRef = useRef<MicVAD | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const initVAD = async () => {
      try {
        vadRef.current = await MicVAD.new({
          onSpeechStart: () => {
            console.log('Speech detected');
            setIsSpeaking(true);
          },
          onSpeechEnd: async (audio) => {
            console.log('Speech ended, received audio samples:', audio.length);
            setIsSpeaking(false);
            await processAudio(audio);
          },
        });
        
        setIsReady(true);
      } catch (e) {
        console.error('Failed to initialize VAD:', e);
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    // Initialize audio element for TTS playback
    const audioElement = new Audio();
    audioElement.addEventListener('play', () => setIsAiSpeaking(true));
    audioElement.addEventListener('ended', () => setIsAiSpeaking(false));
    audioElement.addEventListener('pause', () => setIsAiSpeaking(false));
    audioElement.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      setIsAiSpeaking(false);
      setError('Audio playback failed. Please try again.');
    });
    audioRef.current = audioElement;

    initVAD();

    return () => {
      if (vadRef.current) {
        vadRef.current.destroy();
      }
      if (audioRef.current) {
        audioRef.current.removeEventListener('play', () => setIsAiSpeaking(true));
        audioRef.current.removeEventListener('ended', () => setIsAiSpeaking(false));
        audioRef.current.removeEventListener('pause', () => setIsAiSpeaking(false));
        audioRef.current.removeEventListener('error', () => setIsAiSpeaking(false));
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Auto-start greeting when ready and listening starts
  useEffect(() => {
    if (isReady && isListening && !hasGreeted && messages.length === 0) {
      sendGreeting();
    }
  }, [isReady, isListening, hasGreeted, messages.length]);

  const sendGreeting = async () => {
    try {
      setHasGreeted(true);
      setIsAiThinking(true);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          greeting: true,
          messageHistory: JSON.stringify([])
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Greeting failed');
      }

      setIsAiThinking(false);

      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('audio')) {
        const aiResponseText = decodeURIComponent(response.headers.get('X-Response') || '');
        
        setMessages([{ role: 'assistant', content: aiResponseText }]);
        
        const audioBlob = await response.blob();
        
        if (audioRef.current) {
          audioRef.current.pause();
          
          const audioUrl = URL.createObjectURL(audioBlob);
          audioRef.current.src = audioUrl;
          audioRef.current.muted = isMuted;
          
          if (!isMuted) {
            const playPromise = audioRef.current.play();
            
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Audio play error:', error);
                setIsAiSpeaking(false);
              });
            }
          } else {
            setIsAiSpeaking(true);
            setTimeout(() => setIsAiSpeaking(false), 3000);
          }
        }
      }
    } catch (err) {
      console.error('Greeting error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsAiThinking(false);
      setIsAiSpeaking(false);
      setHasGreeted(false); // Allow retry
    }
  };

  // Toggle mute for AI responses
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      if (!isMuted && isAiSpeaking) {
        audioRef.current.pause();
      }
    }
  };

  // Convert Float32Array audio data to WAV format
  const float32ArrayToWav = (audioData: Float32Array, sampleRate = 16000) => {
    const numFrames = audioData.length;
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };
    
    floatTo16BitPCM(view, 44, audioData);
    
    return new Blob([buffer], { type: 'audio/wav' });
  };
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const processAudio = async (audioData: Float32Array) => {
    try {
      setIsTranscribing(true);
      
      const wavBlob = float32ArrayToWav(audioData);
      console.log('Converted to WAV, size:', wavBlob.size);
      
      const audioFile = new File([wavBlob], 'speech.wav', { type: 'audio/wav' });
      
      await processConversation(audioFile);
      
      setIsTranscribing(false);
    } catch (err) {
      console.error('Error processing audio:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsTranscribing(false);
    }
  };

  const processConversation = async (audioFile: File) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      
      if (messages.length > 0) {
        formData.append('messageHistory', JSON.stringify(messages));
      }
      
      formData.append('ttsEnabled', 'true');
      
      setIsAiThinking(true);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData);
        throw new Error(errorData.error || 'Processing failed');
      }

      setIsAiThinking(false);

      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('audio')) {
        const userTranscript = decodeURIComponent(response.headers.get('X-Transcript') || '');
        const aiResponseText = decodeURIComponent(response.headers.get('X-Response') || '');
        
        const newMessages: Message[] = [
          ...messages,
          { role: 'user', content: userTranscript },
          { role: 'assistant', content: aiResponseText }
        ];
        setMessages(newMessages);
        
        const audioBlob = await response.blob();
        
        console.log('Audio blob type:', audioBlob.type);
        console.log('Audio blob size:', audioBlob.size);
        
        if (audioRef.current) {
          audioRef.current.pause();
          
          try {
            const audioUrl = URL.createObjectURL(audioBlob);
            audioRef.current.src = audioUrl;
            audioRef.current.muted = isMuted;
            
            console.log('Attempting to play audio from URL:', audioUrl);
            
            if (!isMuted) {
              const playPromise = audioRef.current.play();
              
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  console.error('Audio play error:', error);
                  setIsAiSpeaking(false);
                });
              }
            } else {
              setIsAiSpeaking(true);
              setTimeout(() => setIsAiSpeaking(false), 3000);
            }
          } catch (error) {
            console.error('Error setting up audio playback:', error);
            setIsAiSpeaking(false);
          }
        }
      } else {
        const jsonResponse = await response.json();
        
        const newMessages: Message[] = [
          ...messages,
          { role: 'user', content: jsonResponse.transcript },
          { role: 'assistant', content: jsonResponse.response }
        ];
        setMessages(newMessages);
      }
    } catch (err) {
      console.error('Conversation error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsAiThinking(false);
      setIsAiSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (!vadRef.current || !isReady) return;
    
    if (isListening) {
      vadRef.current.pause();
      setIsSpeaking(false);
    } else {
      vadRef.current.start();
    }
    
    setIsListening(!isListening);
  };

  useEffect(() => {
    if (isAiSpeaking) {
      const timeout = setTimeout(() => {
        setIsAiSpeaking(false);
      }, 10000);
      
      return () => clearTimeout(timeout);
    }
  }, [isAiSpeaking]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-white text-slate-900">
      {error ? (
        <div className="text-red-500 mb-4">Error: {error}</div>
      ) : isReady ? (
        <>
          <div className="flex flex-col items-center w-full">
            <div className="bg-white rounded-2xl shadow-lg p-6 w-[min(720px,92%)] flex flex-col items-center space-y-4">
              <div className="flex flex-col items-center">
                <div className="rounded-full ios-primary-bg p-3 mb-2">
                  <img src="/AGM-white.svg" alt="Logo" className="w-20 h-20" />
                </div>
                <div className="text-slate-900 text-lg font-semibold">AGM</div>
                <div className="text-slate-500 text-sm">Call with AI</div>
              </div>

              <div className="flex justify-center space-x-12 mb-2 mt-2">
            <div className="relative flex items-center justify-center h-64 w-64">
              <div className="text-slate-900 text-center mb-2 absolute -top-8 font-medium">You</div>
              
              <div 
                className={`absolute rounded-full transition-all duration-500 ease-in-out ${
                  isSpeaking 
                    ? 'w-64 h-64 bg-blue-100 animate-pulse' 
                    : 'w-56 h-56 bg-blue-50'
                }`}
              />
              
              <div 
                className={`absolute rounded-full transition-all duration-400 ease-in-out ${
                  isSpeaking 
                    ? 'w-52 h-52 bg-blue-100/80 animate-pulse' 
                    : 'w-44 h-44 bg-blue-50'
                }`}
              />
              
              <div 
                className={`absolute rounded-full transition-all duration-300 ease-in-out ${
                  isSpeaking 
                    ? 'w-40 h-40 bg-blue-600 scale-110' 
                    : 'w-32 h-32 bg-blue-50'
                }`}
              />
              
              <button
                onClick={toggleListening}
                className={`absolute z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 
                  bg-white hover:bg-slate-100 ${isListening ? 'ring-2 ring-blue-500' : ''}`}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
                disabled={isTranscribing || isAiThinking || isAiSpeaking}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={isListening ? "#0a84ff" : "#0b1220"}
                  className="w-6 h-6"
                >
                  {isListening ? (
                    <path
                      fillRule="evenodd"
                      d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                    />
                  ) : (
                    <path
                      d="M8 11C8 12.6569 9.34315 14 11 14H13C14.6569 14 16 12.6569 16 11V5C16 3.34315 14.6569 2 13 2H11C9.34315 2 8 3.34315 8 5V11Z"
                    />
                  )}
                  {!isListening && (
                    <path
                      d="M18 11C18 14.3137 15.3137 17 12 17C8.68629 17 6 14.3137 6 11M12 17V20M12 20H15M12 20H9M12 23H12.01"
                      stroke="#374151"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                </svg>
              </button>
            </div>
            
            <div className="relative flex items-center justify-center h-64 w-64">
              <div className="absolute -top-8 flex items-center">
                <span className="text-slate-900 text-center mr-2">AI</span>
                <button
                  onClick={toggleMute}
                  className={`z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 
                    bg-white hover:bg-gray-200 ${isMuted ? 'ring-1 ring-red-500' : ''}`}
                  aria-label={isMuted ? 'Unmute AI' : 'Mute AI'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill={isMuted ? "#EF4444" : "#374151"}
                    className="w-4 h-4"
                  >
                    {isMuted ? (
                      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
                    ) : (
                      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                    )}
                  </svg>
                </button>
              </div>
              
              <div 
                className={`absolute rounded-full transition-all duration-500 ease-in-out ${
                  isAiSpeaking 
                    ? 'w-64 h-64 bg-blue-100/60 animate-pulse' 
                    : isAiThinking
                      ? 'w-56 h-56 bg-blue-50 animate-pulse'
                      : 'w-56 h-56 bg-slate-100'
                }`}
              />
              
              <div 
                className={`absolute rounded-full transition-all duration-400 ease-in-out ${
                  isAiSpeaking 
                    ? 'w-52 h-52 bg-blue-100/80 animate-pulse' 
                    : isAiThinking
                      ? 'w-44 h-44 bg-blue-50 animate-pulse'
                      : 'w-44 h-44 bg-slate-100'
                }`}
              />
              
              <div 
                className={`absolute rounded-full transition-all duration-300 ease-in-out ${
                  isAiSpeaking 
                    ? 'w-40 h-40 bg-blue-50 scale-110' 
                    : isAiThinking
                      ? 'w-32 h-32 bg-blue-100'
                      : 'w-32 h-32 bg-slate-100'
                }`}
              />
              
              {(isAiSpeaking || isAiThinking) && (
                <div className="absolute z-10 flex flex-col items-center justify-center">
                  <div className="flex space-x-8 mb-4">
                    <div className="w-4 h-4 bg-slate-900 rounded-full"></div>
                    <div className="w-4 h-4 bg-slate-900 rounded-full"></div>
                  </div>
                  
                  {isAiSpeaking ? (
                    <div className="w-16 h-4 bg-slate-900 rounded-full animate-pulse"></div>
                  ) : (
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-slate-900 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-900 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-slate-900 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  )}
                </div>
              )}
            </div>
              </div>

              <div className="w-full flex items-center justify-between px-4 mt-2">
                <div className="text-slate-600 text-sm">{isListening ? 'Live' : 'Idle'}</div>
              </div>
            </div>
          </div>

          <p className="text-slate-700 mb-4">
            {isAiSpeaking 
              ? 'AI is speaking...'
              : isAiThinking
                ? 'AI is thinking...'
                : isTranscribing 
                  ? 'Transcribing speech...' 
                  : isSpeaking 
                    ? 'Speech detected!' 
                    : isListening 
                      ? 'Listening for speech...' 
                      : 'Click the mic to start'
            }
          </p>
          
          {messages.length > 0 && (
            <div className="mt-4 max-w-xl w-full px-6 overflow-y-auto max-h-[40vh]">
              {messages
                .filter((message) => message.role === 'assistant')
                .map((message, index) => (
                  <div
                    key={index}
                    className={`mb-4 bg-slate-100 mr-12 text-slate-900 rounded-lg p-3`}
                  >
                    <p className="font-medium mb-1">AI:</p>
                    <p className="text-slate-800">{message.content}</p>
                  </div>
                ))}
            </div>
          )}
          
          {messages.length > 0 && (
            <button 
              onClick={() => {
                setMessages([]);
                setHasGreeted(false);
              }}
              className="mt-4 px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800 transition"
            >
              Clear Conversation
            </button>
          )}
        </>
      ) : (
        <div className="text-slate-700">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          Loading speech detector...
        </div>
      )}
      
      <audio 
        controls 
        className="hidden"
        id="debug-audio"
      />
    </div>
  );
}