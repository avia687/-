import { useState } from 'react';

// עוטף <img> ומסתיר את עצמו בשקט אם הקובץ עוד לא הועלה —
// כך שאפשר להצביע ל-public/drinks/<file>.jpg מראש ולהוסיף את התמונה בהמשך.
export default function ThumbImage({ src, alt = '', className }) {
  const [error, setError] = useState(false);
  if (!src || error) return null;
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setError(true)} />;
}
