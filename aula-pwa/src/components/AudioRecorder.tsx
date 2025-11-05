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
  const maxHistoryLength = 400; // Número de frames de histórico (mais para scroll horizontal)
  const isRecordingRef = useRef(false);
  const canvasWidthRef = useRef(800);
  const canvasHeightRef = useRef(400);

  // Redimensionar canvas responsivamente
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(800, rect.width);
      const newHeight = Math.max(300, Math.min(400, (rect.width / 800) * 400));
      
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
      
      analyser.fftSize = 4096; // FFT maior para melhor resolução de frequência
      analyser.smoothingTimeConstant = 0.3; // Menos suavização para visualização mais precisa
      analyser.minDecibels = -100;
      analyser.maxDecibels = -30;
      
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

      // Desenhar espectrograma (mapa de calor)
      drawSpectrogram(ctx, canvas);
    };

    draw();
  };

  // Função para converter intensidade em cor (mapa de calor)
  const getHeatmapColor = (intensity: number): string => {
    // Normalizar intensidade (0-1)
    const normalized = Math.min(1, Math.max(0, intensity));

    // Gradiente de cores: Azul escuro → Verde/Ciano → Amarelo → Vermelho → Branco
    if (normalized < 0.2) {
      // Azul escuro a Azul médio (0-20%)
      const factor = normalized / 0.2;
      const r = Math.floor(0 * factor);
      const g = Math.floor(0 * factor);
      const b = Math.floor(51 + (100 * factor));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalized < 0.4) {
      // Azul a Ciano (20-40%)
      const factor = (normalized - 0.2) / 0.2;
      const r = Math.floor(0);
      const g = Math.floor(100 + (155 * factor));
      const b = Math.floor(255);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalized < 0.6) {
      // Ciano a Verde (40-60%)
      const factor = (normalized - 0.4) / 0.2;
      const r = Math.floor(0);
      const g = Math.floor(255);
      const b = Math.floor(255 - (255 * factor));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalized < 0.8) {
      // Verde a Amarelo (60-80%)
      const factor = (normalized - 0.6) / 0.2;
      const r = Math.floor(255 * factor);
      const g = Math.floor(255);
      const b = Math.floor(0);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Amarelo a Vermelho a Branco (80-100%)
      const factor = (normalized - 0.8) / 0.2;
      if (factor < 0.5) {
        // Amarelo a Vermelho
        const subFactor = factor * 2;
        const r = Math.floor(255);
        const g = Math.floor(255 - (255 * subFactor));
        const b = Math.floor(0);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Vermelho a Branco
        const subFactor = (factor - 0.5) * 2;
        const r = Math.floor(255);
        const g = Math.floor(0 + (255 * subFactor));
        const b = Math.floor(0 + (255 * subFactor));
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
  };

  const drawSpectrogram = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    const historyLength = spectrogramHistoryRef.current.length;

    // Background escuro
    ctx.fillStyle = '#000033'; // Azul muito escuro
    ctx.fillRect(0, 0, width, height);

    if (historyLength === 0) return;

    // Calcular largura de cada coluna
    const columnWidth = width / maxHistoryLength;
    const startIndex = Math.max(0, historyLength - maxHistoryLength);

    // Desenhar espectrograma estilo mapa de calor
    // Eixo X: Tempo (esquerda para direita, scroll horizontal)
    // Eixo Y: Frequência (0 Hz no topo, ~8000 Hz embaixo)
    
    for (let i = startIndex; i < historyLength; i++) {
      const frequencyData = spectrogramHistoryRef.current[i];
      const x = (i - startIndex) * columnWidth;

      // Desenhar cada frequência como um pixel vertical
      // Frequências mais baixas (índices menores) = topo do canvas
      for (let j = 0; j < frequencyData.length; j++) {
        const value = frequencyData[j];
        const intensity = value / 255;
        
        // Inverter Y: 0 Hz (topo) até ~8000 Hz (embaixo)
        const y = (j / frequencyData.length) * height;
        const pixelHeight = height / frequencyData.length;

        // Obter cor do mapa de calor
        ctx.fillStyle = getHeatmapColor(intensity);
        ctx.fillRect(x, y, columnWidth, pixelHeight);
      }
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
            Fale próximo ao microfone para ver as frequências da sua voz em tempo real no mapa de calor.
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
            <div className={styles.frequencyLabel}>
              <span className={styles.freqTop}>0 Hz</span>
              <span className={styles.freqMiddle}>Frequências</span>
              <span className={styles.freqBottom}>~8000 Hz</span>
            </div>
            {state === 'recording' && (
              <div className={styles.timeContainer}>
                <span className={styles.micStatus}>🎤 Ativo</span>
                <span className={styles.timeDisplay}>{formatTime(recordingTime)}</span>
              </div>
            )}
            {state === 'idle' && (
              <span className={styles.micStatus}>🎤 Inativo</span>
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
          <li>Fale próximo ao microfone para ver as frequências no mapa de calor</li>
          <li>O espectrograma mostra tempo (horizontal) e frequências (vertical)</li>
          <li>Clique em "⏹️ Parar Gravação" quando terminar</li>
          <li>Use "▶️ Reproduzir" para ouvir ou "🔄 Nova Gravação" para gravar novamente</li>
        </ul>
      </div>
    </div>
  );
};
