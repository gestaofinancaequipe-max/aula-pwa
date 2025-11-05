import { useParams, useNavigate } from 'react-router-dom';
import { getAulaById } from '../utils/mockData';
import { getYouTubeEmbedUrl } from '../utils/youtubeUtils';
import { AudioRecorder } from '../components/AudioRecorder';
import styles from './AulaDetalhes.module.css';

export const AulaDetalhes = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const aula = id ? getAulaById(id) : undefined;

  if (!aula) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Aula não encontrada</h2>
          <button onClick={() => navigate('/')} className={styles.backButton}>
            Voltar para o início
          </button>
        </div>
      </div>
    );
  }

  // Se for aula2, mostrar o componente de gravação de áudio
  if (aula.id === 'aula2') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.infoSection}>
            <h1 className={styles.title}>{aula.titulo}</h1>
            <div className={styles.meta}>
              <span className={styles.duration}>
                <svg
                  className={styles.clockIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {aula.duracao}
              </span>
            </div>
            <p className={styles.description}>{aula.descricao}</p>
          </div>
          <AudioRecorder />
        </div>
      </div>
    );
  }

  // Para outras aulas, mostrar o vídeo do YouTube
  const embedUrl = getYouTubeEmbedUrl(aula.videoUrl);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.videoSection}>
          <div className={styles.videoWrapper}>
            <iframe
              className={styles.video}
              src={embedUrl}
              title={aula.titulo}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        <div className={styles.infoSection}>
          <h1 className={styles.title}>{aula.titulo}</h1>
          <div className={styles.meta}>
            <span className={styles.duration}>
              <svg
                className={styles.clockIcon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {aula.duracao}
            </span>
          </div>
          <p className={styles.description}>{aula.descricao}</p>
        </div>
      </div>
    </div>
  );
};
