// frontend/src/api/client.ts
export async function scanFolder(path: string) {
  const response = await fetch('http://localhost:8080/api/scan-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return response.json();
}