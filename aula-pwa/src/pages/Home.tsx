import { aulas } from '../utils/mockData';
import { AulaCard } from '../components/AulaCard';
import styles from './Home.module.css';

export const Home = () => {
  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Bem vindo Mente Comunicativa</h1>
        <p className={styles.subtitle}>
          Explore nossa coleção de aulas e aprenda no seu próprio ritmo
        </p>
      </div>

      <div className={styles.aulasSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Aulas Disponíveis</h2>
          <span className={styles.count}>{aulas.length} aulas</span>
        </div>

        <div className={styles.aulasGrid}>
          {aulas.map((aula, index) => (
            <div
              key={aula.id}
              style={{ animationDelay: `${index * 0.1}s` }}
              className="fade-in"
            >
              <AulaCard aula={aula} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
