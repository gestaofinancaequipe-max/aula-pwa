export const getYouTubeEmbedUrl = (url: string): string => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;
  
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}`;
  }
  
  // Se não conseguir extrair o ID, retorna a URL original
  return url;
};
