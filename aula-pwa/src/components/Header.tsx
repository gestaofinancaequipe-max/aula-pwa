import { Link, useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

export const Header = () => {
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <svg
            className={styles.logoIcon}
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
          <span>Aula PWA</span>
        </Link>
        <nav className={styles.nav}>
          <button
            onClick={() => navigate(-1)}
            className={styles.backButton}
            aria-label="Voltar"
          >
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
        </nav>
      </div>
    </header>
  );
};
