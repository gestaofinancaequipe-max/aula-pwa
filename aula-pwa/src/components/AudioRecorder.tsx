import { useState, useRef, useEffect } from 'react';
import styles from './AudioRecorder.module.css';

interface AudioRecorderProps {}

type RecordingState = 'idle' | 'recording' | 'recorded';
type CalibrationState = 'calibrating' | 'calibrated';

export const AudioRecorder = ({}: AudioRecorderProps) => {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [smoothedPitch, setSmoothedPitch] = useState<number | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>('calibrating');
  const [pitchDirection, setPitchDirection] = useState<'up' | 'down' | 'stable' | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Histórico de pitch para desenhar o trail (com timestamp e fade-out)
  interface PitchPoint {
    pitch: number;
    timestamp: number;
  }
  const pitchHistoryRef = useRef<PitchPoint[]>([]);
  const maxHistoryLength = 300; // ~3 segundos a 60fps
  
  // Para calibração automática
  const calibrationStartTimeRef = useRef<number | null>(null);
  const calibrationDuration = 3000; // 3 segundos
  const detectedMinPitchRef = useRef<number | null>(null);
  const detectedMaxPitchRef = useRef<number | null>(null);
  const isCalibratingRef = useRef(true);
  
  // Média móvel (rolling average)
  const pitchBufferRef = useRef<number[]>([]);
  const bufferSize = 8; // Últimos 8 frames
  
  // Suavização avançada
  const lastDisplayedPitchRef = useRef<number | null>(null);
  const lerpFactor = 0.3; // 0.3 = 30% do novo valor, 70% do anterior
  const minChangeThreshold = 5; // Hz - só atualiza se mudança > 5Hz
  
  const isRecordingRef = useRef(false);
  const canvasWidthRef = useRef(800);
  const canvasHeightRef = useRef(600);
  
  // Limites de detecção de pitch (usados como fallback antes da calibração)
  const ABSOLUTE_MIN_PITCH = 80; // Hz
  const ABSOLUTE_MAX_PITCH = 600; // Hz
  const MIN_VOLUME_THRESHOLD = 0.001; // Threshold mínimo para detectar pitch (energia)
  const CONFIDENCE_THRESHOLD = 0.7; // Threshold de confiança para aceitar detecção

  // Redimensionar canvas responsivamente
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(800, rect.width);
      const newHeight = Math.max(500, 600);
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      canvasWidthRef.current = newWidth;
      canvasHeightRef.current = newHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Função de autocorrelação melhorada para detectar pitch
  const detectPitch = (buffer: Float32Array, sampleRate: number): { pitch: number | null; confidence: number } => {
    const bufferLength = buffer.length;
    const minPeriod = Math.floor(sampleRate / ABSOLUTE_MAX_PITCH);
    const maxPeriod = Math.floor(sampleRate / ABSOLUTE_MIN_PITCH);

    // Normalizar o buffer (remover DC offset)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += buffer[i];
    }
    const mean = sum / bufferLength;
    const normalizedBuffer = new Float32Array(bufferLength);
    for (let i = 0; i < bufferLength; i++) {
      normalizedBuffer[i] = buffer[i] - mean;
    }

    // Verificar nível de energia total
    let energy = 0;
    for (let i = 0; i < bufferLength; i++) {
      energy += normalizedBuffer[i] * normalizedBuffer[i];
    }
    energy = energy / bufferLength;
    
    if (energy < MIN_VOLUME_THRESHOLD) {
      return { pitch: null, confidence: 0 };
    }

    // Calcular autocorrelação normalizada
    let maxCorrelation = -1;
    let bestPeriod = -1;

    for (let period = minPeriod; period <= maxPeriod && period < bufferLength / 2; period++) {
      let correlation = 0;
      let normalization = 0;

      for (let i = 0; i < bufferLength - period; i++) {
        correlation += normalizedBuffer[i] * normalizedBuffer[i + period];
        normalization += normalizedBuffer[i] * normalizedBuffer[i];
      }

      if (normalization > 0) {
        correlation = correlation / normalization;
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }

    // Verificar confiança e validade
    if (bestPeriod > 0 && maxCorrelation > CONFIDENCE_THRESHOLD) {
      const frequency = sampleRate / bestPeriod;
      
      if (frequency >= ABSOLUTE_MIN_PITCH && frequency <= ABSOLUTE_MAX_PITCH) {
        return { pitch: frequency, confidence: maxCorrelation };
      }
    }

    return { pitch: null, confidence: 0 };
  };

  // Converter frequência para posição Y no canvas (com auto-ajuste)
  const frequencyToY = (frequency: number, canvasHeight: number): number => {
    const minPitch = detectedMinPitchRef.current ?? ABSOLUTE_MIN_PITCH;
    const maxPitch = detectedMaxPitchRef.current ?? ABSOLUTE_MAX_PITCH;
    
    // Normalizar entre min e max detectados (10% a 90% da altura)
    const normalized = (frequency - minPitch) / (maxPitch - minPitch);
    // Clamp entre 0 e 1
    const clamped = Math.max(0, Math.min(1, normalized));
    // Mapear para 10% a 90% da altura (invertido: grave embaixo, agudo em cima)
    return canvasHeight * (0.9 - (clamped * 0.8));
  };

  // Obter nota musical aproximada
  const getMusicalNote = (frequency: number): string => {
    const A4 = 440;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    const semitones = Math.round(12 * Math.log2(frequency / A4));
    const octave = Math.floor(semitones / 12) + 4;
    const noteIndex = ((semitones % 12) + 12) % 12;
    
    return `${noteNames[noteIndex]}${octave}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      
      streamRef.current = stream;

      // Configurar Web Audio API para análise
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.85; // Aumentado para reduzir oscilação
      analyser.minDecibels = -100;
      analyser.maxDecibels = -30;
      
      // Criar ScriptProcessorNode para análise de pitch
      const bufferSize = 4096;
      const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      // Criar um GainNode com volume 0 para evitar feedback
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;

      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      analyserRef.current = analyser;

      // Reset calibração
      setCalibrationState('calibrating');
      isCalibratingRef.current = true;
      calibrationStartTimeRef.current = Date.now();
      detectedMinPitchRef.current = null;
      detectedMaxPitchRef.current = null;
      pitchHistoryRef.current = [];
      pitchBufferRef.current = [];
      lastDisplayedPitchRef.current = null;

      // Processar áudio para detecção de pitch
      scriptProcessor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Detectar pitch usando autocorrelação
        const { pitch, confidence } = detectPitch(inputData, audioContext.sampleRate);
        
        if (pitch !== null && confidence >= CONFIDENCE_THRESHOLD) {
          setCurrentPitch(pitch);
          
          // Fase de calibração (primeiros 3 segundos)
          const now = Date.now();
          const isCalibrating = isCalibratingRef.current && calibrationStartTimeRef.current && 
            (now - calibrationStartTimeRef.current) < calibrationDuration;
          
          if (isCalibrating) {
            // Atualizar min/max durante calibração
            if (detectedMinPitchRef.current === null || pitch < detectedMinPitchRef.current) {
              detectedMinPitchRef.current = pitch;
            }
            if (detectedMaxPitchRef.current === null || pitch > detectedMaxPitchRef.current) {
              detectedMaxPitchRef.current = pitch;
            }
          } else if (isCalibratingRef.current) {
            // Finalizar calibração
            isCalibratingRef.current = false;
            setCalibrationState('calibrated');
            // Garantir um range mínimo
            if (detectedMaxPitchRef.current && detectedMinPitchRef.current && 
                detectedMaxPitchRef.current - detectedMinPitchRef.current < 50) {
              const center = (detectedMinPitchRef.current + detectedMaxPitchRef.current) / 2;
              detectedMinPitchRef.current = Math.max(ABSOLUTE_MIN_PITCH, center - 50);
              detectedMaxPitchRef.current = Math.min(ABSOLUTE_MAX_PITCH, center + 50);
            }
          }
          
          // Média móvel (rolling average)
          pitchBufferRef.current.push(pitch);
          if (pitchBufferRef.current.length > bufferSize) {
            pitchBufferRef.current.shift();
          }
          
          const averagePitch = pitchBufferRef.current.reduce((a, b) => a + b, 0) / pitchBufferRef.current.length;
          
          // Aplicar lerp (interpolação linear)
          let smoothed: number;
          if (lastDisplayedPitchRef.current !== null) {
            // Só atualizar se mudança > threshold
            const change = Math.abs(averagePitch - lastDisplayedPitchRef.current);
            
            if (change > minChangeThreshold) {
              smoothed = lastDisplayedPitchRef.current * (1 - lerpFactor) + averagePitch * lerpFactor;
            } else {
              // Mudança pequena: suavizar mais
              smoothed = lastDisplayedPitchRef.current * 0.9 + averagePitch * 0.1;
            }
          } else {
            smoothed = averagePitch;
          }
          
          setSmoothedPitch(smoothed);
          lastDisplayedPitchRef.current = smoothed;
          
          // Detectar direção
          if (lastDisplayedPitchRef.current !== null) {
            const diff = smoothed - lastDisplayedPitchRef.current;
            if (Math.abs(diff) > 2) {
              setPitchDirection(diff > 0 ? 'up' : 'down');
            } else {
              setPitchDirection('stable');
            }
          }
          
          // Adicionar ao histórico com timestamp
          pitchHistoryRef.current.push({
            pitch: smoothed,
            timestamp: now
          });
          
          // Limitar histórico e remover pontos muito antigos
          const maxAge = 3000; // 3 segundos
          pitchHistoryRef.current = pitchHistoryRef.current.filter(
            point => (now - point.timestamp) < maxAge
          );
          
          if (pitchHistoryRef.current.length > maxHistoryLength) {
            pitchHistoryRef.current.shift();
          }
        } else {
          // Sem pitch detectado
          setCurrentPitch(null);
          if (lastDisplayedPitchRef.current !== null) {
            // Fade out gradual
            const faded = lastDisplayedPitchRef.current * 0.95;
            if (faded > 10) {
              setSmoothedPitch(faded);
              lastDisplayedPitchRef.current = faded;
            } else {
              setSmoothedPitch(null);
              lastDisplayedPitchRef.current = null;
            }
          }
          setPitchDirection(null);
        }
      };

      // Configurar MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setState('recorded');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (scriptProcessorRef.current) {
          scriptProcessorRef.current.disconnect();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      setState('recording');
      setRecordingTime(0);
      
      // Timer
      timeIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Iniciar visualização
      startVisualization();

    } catch (err: any) {
      console.error('Erro ao iniciar gravação:', err);
      setError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Permissão de microfone negada. Por favor, permita o acesso ao microfone nas configurações do navegador.'
          : 'Erro ao acessar o microfone. Verifique se seu dispositivo tem um microfone disponível.'
      );
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      isRecordingRef.current = false;
      mediaRecorderRef.current.stop();
      setState('recorded');
      
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
        timeIntervalRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }
    }
  };

  const clearRecording = () => {
    isRecordingRef.current = false;
    setState('idle');
    setRecordingTime(0);
    setAudioUrl(null);
    setError(null);
    setAudioLevel(0);
    setCurrentPitch(null);
    setSmoothedPitch(null);
    setCalibrationState('calibrating');
    isCalibratingRef.current = true;
    setPitchDirection(null);
    pitchHistoryRef.current = [];
    pitchBufferRef.current = [];
    lastDisplayedPitchRef.current = null;
    detectedMinPitchRef.current = null;
    detectedMaxPitchRef.current = null;
    calibrationStartTimeRef.current = null;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
    }
  };

  const recalibrate = () => {
    setCalibrationState('calibrating');
    isCalibratingRef.current = true;
    calibrationStartTimeRef.current = Date.now();
    detectedMinPitchRef.current = null;
    detectedMaxPitchRef.current = null;
    pitchHistoryRef.current = [];
    pitchBufferRef.current = [];
    lastDisplayedPitchRef.current = null;
  };

  const startVisualization = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isRecordingRef.current = true;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current || !isRecordingRef.current) {
        isRecordingRef.current = false;
        return;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calcular nível de áudio médio
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setAudioLevel(average);

      // Desenhar visualização de pitch
      drawPitchVisualization(ctx, canvas);
    };

    draw();
  };

  const drawPitchVisualization = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    const now = Date.now();

    // Background em uma cor só
    ctx.fillStyle = '#1e293b'; // Cinza escuro
    ctx.fillRect(0, 0, width, height);

    // Linha central de referência (50%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Desenhar grid de referência
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Linhas horizontais para frequências de referência
    const referenceFreqs = [100, 150, 200, 250, 300, 350, 400, 450, 500];
    referenceFreqs.forEach(freq => {
      const y = frequencyToY(freq, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });

    // Desenhar trail/histórico com fade-out gradual
    if (pitchHistoryRef.current.length > 1) {
      const history = pitchHistoryRef.current;
      
      for (let i = 0; i < history.length - 1; i++) {
        const point1 = history[i];
        const point2 = history[i + 1];
        
        // Calcular opacidade baseada na idade (mais antigo = mais transparente)
        const age = now - point1.timestamp;
        const maxAge = 3000; // 3 segundos
        const opacity = Math.max(0, 1 - (age / maxAge)) * 0.6;
        
        // Gradiente roxo → rosa baseado na posição
        const y1 = frequencyToY(point1.pitch, height);
        const y2 = frequencyToY(point2.pitch, height);
        const normalizedY = (y1 / height);
        
        // Interpolar entre roxo e rosa
        const r = Math.floor(168 + (255 - 168) * normalizedY);
        const g = Math.floor(85 + (192 - 85) * normalizedY);
        const b = Math.floor(247 + (203 - 247) * normalizedY);
        
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        const x1 = (i / maxHistoryLength) * width;
        const x2 = ((i + 1) / maxHistoryLength) * width;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Desenhar linha principal de pitch (se houver)
    if (smoothedPitch !== null) {
      const y = frequencyToY(smoothedPitch, height);

      // Glow effect (sombra com blur)
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Linha horizontal
      ctx.strokeStyle = '#ef4444'; // Vermelho
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Ponto central destacado
      ctx.fillStyle = '#fecaca';
      ctx.beginPath();
      ctx.arc(width / 2, y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Borda do ponto
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calcular posição Y atual para labels
  const canvasHeight = canvasRef.current?.height || canvasHeightRef.current;
  const currentY = smoothedPitch !== null ? frequencyToY(smoothedPitch, canvasHeight) : null;

  return (
    <div className={styles.container}>
      <div className={styles.infoSection}>
        <h2 className={styles.title}>Detecção de Pitch (Tom da Voz)</h2>
        <p className={styles.description}>
          Fale "zzzzzz" contínuo e vá subindo o tom (grave→agudo) e descendo (agudo→grave). 
          A linha vermelha acompanhará o movimento vocal de forma suave.
        </p>
      </div>

      {error && (
        <div className={styles.errorBox}>
          <svg
            className={styles.errorIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p>{error}</p>
        </div>
      )}

      {/* Mensagem de calibração */}
      {state === 'recording' && calibrationState === 'calibrating' && (
        <div className={styles.calibrationBox}>
          <p>🎯 <strong>Calibrando...</strong> Fale "aaaa" do grave ao agudo para calibrar o range da sua voz.</p>
        </div>
      )}

      <div className={styles.recorderSection}>
        {/* Canvas para visualização de pitch */}
        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={800}
            height={600}
          />
          
          {/* Labels laterais de frequência */}
          <div className={styles.frequencyLabels}>
            <div className={styles.labelTop}>
              <span className={styles.labelText}>AGUDO ↑</span>
              <span className={styles.labelFreq}>
                {calibrationState === 'calibrated' && detectedMaxPitchRef.current 
                  ? `${Math.round(detectedMaxPitchRef.current)} Hz`
                  : '500 Hz'}
              </span>
            </div>
            <div className={styles.labelMiddle}>
              <span className={styles.labelFreq}>
                {calibrationState === 'calibrated' && detectedMinPitchRef.current && detectedMaxPitchRef.current
                  ? `${Math.round((detectedMinPitchRef.current + detectedMaxPitchRef.current) / 2)} Hz`
                  : '290 Hz'}
              </span>
            </div>
            <div className={styles.labelBottom}>
              <span className={styles.labelText}>GRAVE ↓</span>
              <span className={styles.labelFreq}>
                {calibrationState === 'calibrated' && detectedMinPitchRef.current
                  ? `${Math.round(detectedMinPitchRef.current)} Hz`
                  : '80 Hz'}
              </span>
            </div>
          </div>

          {/* Indicador de pitch atual */}
          {smoothedPitch !== null && currentY !== null && (
            <div 
              className={styles.pitchIndicator}
              style={{ 
                top: `${Math.max(10, Math.min(canvasHeight - 10, currentY))}px` 
              }}
            >
              <span className={styles.pitchValue}>
                {Math.round(smoothedPitch)} Hz
              </span>
              <span className={styles.pitchNote}>
                {getMusicalNote(smoothedPitch)}
              </span>
              {pitchDirection && (
                <span className={styles.pitchDirection}>
                  {pitchDirection === 'up' ? '↗' : pitchDirection === 'down' ? '↘' : '→'}
                </span>
              )}
            </div>
          )}

          {/* Info inferior do canvas */}
          <div className={styles.canvasLabel}>
            {state === 'recording' && (
              <div className={styles.timeContainer}>
                <span className={styles.micStatus}>🎤 Ativo</span>
                <span className={styles.timeDisplay}>{formatTime(recordingTime)}</span>
                {calibrationState === 'calibrating' && (
                  <span className={styles.calibrationStatus}>Calibrando...</span>
                )}
              </div>
            )}
            {state === 'idle' && (
              <span className={styles.micStatus}>🎤 Inativo</span>
            )}
            {state === 'recorded' && smoothedPitch === null && (
              <span className={styles.micStatus}>Gravação concluída</span>
            )}
          </div>
        </div>

        {/* Indicador de nível de áudio */}
        {state === 'recording' && (
          <div className={styles.audioLevelContainer}>
            <div className={styles.audioLevelBar}>
              <div
                className={styles.audioLevelFill}
                style={{ width: `${audioLevel}%` }}
              />
            </div>
            <span className={styles.audioLevelText}>
              Nível de áudio: {Math.round(audioLevel)}%
              {currentPitch !== null && ` | Pitch: ${Math.round(currentPitch)} Hz`}
            </span>
          </div>
        )}

        {/* Controles */}
        <div className={styles.controls}>
          {state === 'idle' && (
            <button
              onClick={startRecording}
              className={`${styles.recordButton} ${styles.idle}`}
              aria-label="Iniciar gravação"
            >
              <span className={styles.buttonEmoji}>🎤</span>
              <span>Iniciar Gravação</span>
            </button>
          )}

          {state === 'recording' && (
            <>
              <button
                onClick={stopRecording}
                className={`${styles.recordButton} ${styles.recording}`}
                aria-label="Parar gravação"
              >
                <div className={styles.recordingPulse} />
                <span className={styles.buttonEmoji}>⏹️</span>
                <span>Parar Gravação</span>
                <span className={styles.time}>{formatTime(recordingTime)}</span>
              </button>
              {calibrationState === 'calibrated' && (
                <button
                  onClick={recalibrate}
                  className={`${styles.recordButton} ${styles.recalibrateButton}`}
                  aria-label="Recalibrar"
                >
                  <span className={styles.buttonEmoji}>🔄</span>
                  <span>Recalibrar</span>
                </button>
              )}
            </>
          )}

          {state === 'recorded' && (
            <div className={styles.recordedControls}>
              <div className={styles.recordedButtons}>
                <button
                  onClick={clearRecording}
                  className={`${styles.recordButton} ${styles.clearButton}`}
                  aria-label="Nova gravação"
                >
                  <span className={styles.buttonEmoji}>🔄</span>
                  <span>Nova Gravação</span>
                </button>

                {audioUrl && (
                  <button
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.play();
                      }
                    }}
                    className={`${styles.recordButton} ${styles.playButton}`}
                    aria-label="Reproduzir gravação"
                  >
                    <span className={styles.buttonEmoji}>▶️</span>
                    <span>Reproduzir</span>
                  </button>
                )}
              </div>

              {audioUrl && (
                <div className={styles.audioPlayer}>
                  <audio ref={audioRef} src={audioUrl} controls className={styles.audioElement} />
                  <p className={styles.audioHint}>
                    Reproduza sua gravação usando o player acima
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.instructions}>
        <h3>Instruções:</h3>
        <ul>
          <li>Clique em "🎤 Iniciar Gravação" para começar</li>
          <li>Nos primeiros 3 segundos, fale "aaaa" do grave ao agudo para calibrar</li>
          <li>Depois, fale "zzzzzz" contínuo e vá subindo/descendo o tom → a linha deve desenhar uma CURVA SUAVE</li>
          <li>Tom constante → linha deve ficar ESTÁVEL (sem tremer)</li>
          <li>Subindo gradualmente → linha deve SUBIR SUAVEMENTE</li>
          <li>Descendo gradualmente → linha deve DESCER SUAVEMENTE</li>
          <li>Use "🔄 Recalibrar" se quiser ajustar o range novamente</li>
        </ul>
      </div>
    </div>
  );
};
