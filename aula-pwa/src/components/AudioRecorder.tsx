import { useState, useRef, useEffect } from 'react';
import styles from './AudioRecorder.module.css';

interface AudioRecorderProps {}

type RecordingState = 'idle' | 'recording' | 'recorded';

export const AudioRecorder = ({}: AudioRecorderProps) => {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [smoothedPitch, setSmoothedPitch] = useState<number | null>(null);

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

  // Histórico de pitch para desenhar o trail
  const pitchHistoryRef = useRef<number[]>([]);
  const maxHistoryLength = 200;
  const isRecordingRef = useRef(false);
  const canvasWidthRef = useRef(800);
  const canvasHeightRef = useRef(500);
  
  // Para suavização temporal
  const lastPitchRef = useRef<number | null>(null);
  const smoothingFactor = 0.3; // 0-1, menor = mais suave

  // Limites de detecção de pitch
  const MIN_PITCH = 80; // Hz - voz grave masculina
  const MAX_PITCH = 500; // Hz - limite agudo
  const MIN_VOLUME_THRESHOLD = 0.001; // Threshold mínimo para detectar pitch (energia)

  // Redimensionar canvas responsivamente
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(800, rect.width);
      const newHeight = Math.max(400, 500);
      
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

  // Função de autocorrelação para detectar pitch
  const detectPitch = (buffer: Float32Array, sampleRate: number): number | null => {
    const bufferLength = buffer.length;
    const minPeriod = Math.floor(sampleRate / MAX_PITCH); // Período mínimo (agudo)
    const maxPeriod = Math.floor(sampleRate / MIN_PITCH); // Período máximo (grave)

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
      return null; // Muito baixo para detectar
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

      // Normalizar pela autocorrelação em lag 0
      if (normalization > 0) {
        correlation = correlation / normalization;
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }

    // Verificar se encontramos uma correlação válida (threshold de 0.3)
    if (bestPeriod > 0 && maxCorrelation > 0.3) {
      const frequency = sampleRate / bestPeriod;
      
      // Verificar se está na faixa válida
      if (frequency >= MIN_PITCH && frequency <= MAX_PITCH) {
        return frequency;
      }
    }

    return null;
  };

  // Converter frequência para posição Y no canvas
  const frequencyToY = (frequency: number, canvasHeight: number): number => {
    // Mapear 80-1000 Hz para 0-100% da altura (invertido: grave embaixo, agudo em cima)
    const normalized = (frequency - MIN_PITCH) / (MAX_PITCH - MIN_PITCH);
    // Inverter: 0 (grave) = embaixo, 1 (agudo) = topo
    return canvasHeight * (1 - normalized);
  };

  // Obter nota musical aproximada
  const getMusicalNote = (frequency: number): string => {
    // Frequências de referência (A4 = 440 Hz)
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
      analyser.smoothingTimeConstant = 0.3;
      
      // Criar ScriptProcessorNode para análise de pitch (autocorrelação precisa de dados no tempo)
      const bufferSize = 4096;
      const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      // Criar um GainNode com volume 0 para evitar feedback (não precisamos ouvir o áudio processado)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;

      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      analyserRef.current = analyser;

      // Processar áudio para detecção de pitch
      scriptProcessor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Detectar pitch usando autocorrelação
        const pitch = detectPitch(inputData, audioContext.sampleRate);
        
        if (pitch !== null) {
          setCurrentPitch(pitch);
          
          // Suavização temporal
          if (lastPitchRef.current !== null) {
            const smoothed = lastPitchRef.current * (1 - smoothingFactor) + pitch * smoothingFactor;
            setSmoothedPitch(smoothed);
            lastPitchRef.current = smoothed;
            
            // Adicionar ao histórico
            pitchHistoryRef.current.push(smoothed);
            if (pitchHistoryRef.current.length > maxHistoryLength) {
              pitchHistoryRef.current.shift();
            }
          } else {
            setSmoothedPitch(pitch);
            lastPitchRef.current = pitch;
            pitchHistoryRef.current.push(pitch);
          }
        } else {
          // Sem pitch detectado (silêncio ou muito baixo)
          setCurrentPitch(null);
          if (lastPitchRef.current !== null) {
            // Fade out gradual
            lastPitchRef.current = null;
            setSmoothedPitch(null);
          }
        }
      };

      // Configurar MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      audioChunksRef.current = [];
      pitchHistoryRef.current = [];
      lastPitchRef.current = null;

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
        
        // Parar stream e processamento
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
    pitchHistoryRef.current = [];
    lastPitchRef.current = null;
    
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

    // Background em uma cor só
    ctx.fillStyle = '#1e293b'; // Cinza escuro
    ctx.fillRect(0, 0, width, height);

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

    // Desenhar trail/histórico da linha de pitch
    if (pitchHistoryRef.current.length > 1) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Vermelho semi-transparente
      ctx.lineWidth = 2;
      ctx.beginPath();

      const history = pitchHistoryRef.current;
      const stepX = width / maxHistoryLength;

      for (let i = 0; i < history.length; i++) {
        const y = frequencyToY(history[i], height);
        const x = (i / maxHistoryLength) * width;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
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

  // Calcular posição Y atual para labels (usar altura do canvas se disponível)
  const canvasHeight = canvasRef.current?.height || canvasHeightRef.current;
  const currentY = smoothedPitch !== null ? frequencyToY(smoothedPitch, canvasHeight) : null;

  return (
    <div className={styles.container}>
      <div className={styles.infoSection}>
        <h2 className={styles.title}>Detecção de Pitch (Tom da Voz)</h2>
        <p className={styles.description}>
          Cante "aaaaaa" mudando do grave ao agudo (até 500 Hz) para ver a linha vermelha acompanhar o tom da sua voz em tempo real.
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

      <div className={styles.recorderSection}>
        {/* Canvas para visualização de pitch */}
        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={800}
            height={500}
          />
          
          {/* Labels laterais de frequência */}
          <div className={styles.frequencyLabels}>
            <div className={styles.labelTop}>
              <span className={styles.labelText}>AGUDO ↑</span>
              <span className={styles.labelFreq}>500 Hz</span>
            </div>
            <div className={styles.labelMiddle}>
              <span className={styles.labelFreq}>290 Hz</span>
            </div>
            <div className={styles.labelBottom}>
              <span className={styles.labelText}>GRAVE ↓</span>
              <span className={styles.labelFreq}>80 Hz</span>
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
            </div>
          )}

          {/* Info inferior do canvas */}
          <div className={styles.canvasLabel}>
            {state === 'recording' && (
              <div className={styles.timeContainer}>
                <span className={styles.micStatus}>🎤 Ativo</span>
                <span className={styles.timeDisplay}>{formatTime(recordingTime)}</span>
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
          <li>Cante "aaaaaa" começando grave e subindo → a linha deve SUBIR continuamente</li>
          <li>Fale "oooo" mantendo tom constante → a linha deve ficar ESTÁVEL</li>
          <li>Cante uma escala musical → a linha deve subir/descer claramente em degraus</li>
          <li>O mesmo fonema ("iii") mostrará diferença entre grave (linha embaixo) e agudo (linha no topo)</li>
          <li>Clique em "⏹️ Parar Gravação" quando terminar</li>
        </ul>
      </div>
    </div>
  );
};
