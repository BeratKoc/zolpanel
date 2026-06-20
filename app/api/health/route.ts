export const runtime = 'nodejs';

// Sağlık kontrolü (auth gerektirmez)
export async function GET() {
  return Response.json({ status: 'ok', app: 'Zolpanel', timestamp: new Date().toISOString() });
}
