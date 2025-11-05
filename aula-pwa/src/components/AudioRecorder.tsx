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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Espectrograma - histórico de frequências ao longo do tempo
  const spectrogramHistoryRef = useRef<Uint8Array[]>([]);
  const maxHistoryLength = 200; // Número de frames de histórico
  const isRecordingRef = useRef(false);

  // Redimensionar canvas responsivamente
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = Math.min(800, rect.width);
      canvas.height = Math.min(400, (rect.width / 800) * 400);
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;

      // Configurar Web Audio API para análise
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      // Configurar MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      audioChunksRef.current = [];
      spectrogramHistoryRef.current = [];

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
        
        // Parar stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
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

      // Limpar histórico após um delay para mostrar o último frame
      setTimeout(() => {
        spectrogramHistoryRef.current = [];
      }, 1000);
    }
  };

  const clearRecording = () => {
    isRecordingRef.current = false;
    setState('idle');
    setRecordingTime(0);
    setAudioUrl(null);
    setError(null);
    setAudioLevel(0);
    spectrogramHistoryRef.current = [];
    
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

      // Adicionar ao histórico do espectrograma
      const frequencyData = new Uint8Array(dataArray);
      spectrogramHistoryRef.current.push(frequencyData);
      
      // Limitar histórico
      if (spectrogramHistoryRef.current.length > maxHistoryLength) {
        spectrogramHistoryRef.current.shift();
      }

      // Desenhar espectrograma
      drawSpectrogram(ctx, canvas, frequencyData);
      drawFrequencyBars(ctx, canvas, frequencyData);
    };

    draw();
  };

  const drawSpectrogram = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    currentData: Uint8Array
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    const historyLength = spectrogramHistoryRef.current.length;

    // Limpar canvas
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, width, height);

    if (historyLength === 0) return;

    // Desenhar espectrograma (histórico de frequências)
    const barWidth = width / historyLength;
    
    for (let i = 0; i < historyLength; i++) {
      const frequencyData = spectrogramHistoryRef.current[i];
      const x = i * barWidth;

      for (let j = 0; j < frequencyData.length; j += 4) {
        const value = frequencyData[j];
        const y = (j / frequencyData.length) * height;
        const barHeight = height / frequencyData.length;

        // Criar gradiente roxo baseado na intensidade
        const intensity = value / 255;
        const hue = 260 + (intensity * 40); // 260 (roxo) a 300 (magenta)
        const saturation = 70 + (intensity * 30);
        const lightness = 30 + (intensity * 40);

        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.fillRect(x, height - y - barHeight, barWidth, barHeight);
      }
    }
  };

  const drawFrequencyBars = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: Uint8Array
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    const barCount = 32; // Reduzir para melhor performance
    const barWidth = width / barCount;
    const step = Math.floor(data.length / barCount);

    // Desenhar barras de frequência no topo
    for (let i = 0; i < barCount; i++) {
      const dataIndex = i * step;
      const barHeight = (data[dataIndex] / 255) * (height * 0.3);
      const x = i * barWidth;

      // Gradiente roxo
      const gradient = ctx.createLinearGradient(x, height - barHeight, x, height);
      gradient.addColorStop(0, '#7c3aed');
      gradient.addColorStop(0.5, '#8b5cf6');
      gradient.addColorStop(1, '#a78bfa');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.infoSection}>
        <h2 className={styles.title}>Gravação de Áudio com Espectrograma</h2>
        <p className={styles.description}>
          Use o botão abaixo para gravar sua voz. O espectrograma mostrará as frequências em tempo real.
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
        {/* Canvas para espectrograma */}
        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={800}
            height={400}
          />
          <div className={styles.canvasLabel}>
            <span>Frequências (0 - 8000 Hz)</span>
            {state === 'recording' && (
              <span className={styles.timeDisplay}>{formatTime(recordingTime)}</span>
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
              <svg
                className={styles.micIcon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <span>Toque para gravar</span>
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
                <svg
                  className={styles.stopIcon}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>Parar gravação</span>
                <span className={styles.time}>{formatTime(recordingTime)}</span>
              </button>
            </>
          )}

          {state === 'recorded' && (
            <div className={styles.recordedControls}>
              <button
                onClick={clearRecording}
                className={`${styles.recordButton} ${styles.recorded}`}
                aria-label="Gravar novamente"
              >
                <svg
                  className={styles.micIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span>Gravação concluída - Toque para gravar novamente</span>
              </button>

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
          <li>Clique em "Toque para gravar" para iniciar a gravação</li>
          <li>O espectrograma mostrará as frequências da sua voz em tempo real</li>
          <li>Clique em "Parar gravação" quando terminar</li>
          <li>Você pode reproduzir e gravar novamente quantas vezes quiser</li>
        </ul>
      </div>
    </div>
  );
};
