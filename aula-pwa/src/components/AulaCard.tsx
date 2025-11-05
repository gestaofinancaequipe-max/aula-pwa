import { Link } from 'react-router-dom';
import { Aula } from '../types';
import styles from './AulaCard.module.css';

interface AulaCardProps {
  aula: Aula;
}

export const AulaCard = ({ aula }: AulaCardProps) => {
  return (
    <Link to={`/aula/${aula.id}`} className={styles.card}>
      <div className={styles.cardContent}>
        <div className={styles.iconWrapper}>
          <svg
            className={styles.icon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className={styles.textContent}>
          <h3 className={styles.title}>{aula.titulo}</h3>
          <p className={styles.description}>{aula.descricao}</p>
          <div className={styles.footer}>
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
        </div>
        <div className={styles.arrow}>
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            width="20"
            height="20"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
};
