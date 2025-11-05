import { Aula } from '../types';

export const aulas: Aula[] = [
  {
    id: '1',
    titulo: 'Introdução ao Desenvolvimento Web',
    descricao: 'Aula introdutória sobre os conceitos fundamentais do desenvolvimento web moderno.',
    duracao: '25:30',
    videoUrl: 'https://www.youtube.com/watch?v=oremnghxfDU'
  },
  {
    id: '2',
    titulo: 'Fundamentos de React',
    descricao: 'Aprenda os conceitos básicos do React, incluindo componentes, props e state.',
    duracao: '32:15',
    videoUrl: 'https://www.youtube.com/watch?v=mock-video-2'
  },
  {
    id: '3',
    titulo: 'React Hooks Avançados',
    descricao: 'Explore hooks avançados como useContext, useReducer e custom hooks.',
    duracao: '28:45',
    videoUrl: 'https://www.youtube.com/watch?v=mock-video-3'
  },
  {
    id: '4',
    titulo: 'Roteamento com React Router',
    descricao: 'Entenda como implementar navegação entre páginas usando React Router DOM.',
    duracao: '20:10',
    videoUrl: 'https://www.youtube.com/watch?v=mock-video-4'
  },
  {
    id: '5',
    titulo: 'Progressive Web Apps (PWA)',
    descricao: 'Crie aplicativos web que funcionam offline com Service Workers e Web App Manifest.',
    duracao: '35:20',
    videoUrl: 'https://www.youtube.com/watch?v=mock-video-5'
  },
  {
    id: '6',
    titulo: 'TypeScript para React',
    descricao: 'Aprenda a usar TypeScript para criar aplicações React mais robustas e escaláveis.',
    duracao: '30:00',
    videoUrl: 'https://www.youtube.com/watch?v=mock-video-6'
  }
];

export const getAulaById = (id: string): Aula | undefined => {
  return aulas.find(aula => aula.id === id);
};
