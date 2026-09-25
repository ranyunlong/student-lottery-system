import { ForbiddenError, requireClassAccess } from '../../../../../lib/access';
import { InvalidEmblemError, loadEmblem, saveUploadedEmblem } from '../../../../../features/classes/emblem';

type Context = { params: Promise<{ classId: string }> };
const classIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorizedClass(context: Context): Promise<string> {
  const { classId } = await context.params;
  if (!classIdPattern.test(classId)) throw new InvalidEmblemError('班级编号无效');
  await requireClassAccess(classId);
  return classId;
}

function errorResponse(error: unknown): Response {
  if (error instanceof ForbiddenError) return new Response('无权访问班级', { status: 403 });
  if (error instanceof InvalidEmblemError) return new Response(error.message, { status: 400 });
  throw error;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const classId = await authorizedClass(context);
    const emblem = await loadEmblem(classId);
    if (!emblem) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(emblem.bytes), { headers: {
      'Content-Type': emblem.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const classId = await authorizedClass(context);
    const contentType = request.headers.get('content-type');
    if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) throw new InvalidEmblemError('表单格式无效');
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = request.body?.getReader();
    if (!reader) throw new InvalidEmblemError('表单格式无效');
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.byteLength;
      if (length > 2 * 1024 * 1024 + 64 * 1024) {
        await reader.cancel();
        throw new InvalidEmblemError('班徽不能超过 2 MiB');
      }
      chunks.push(chunk);
    }
    let form: FormData;
    try {
      form = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType },
        body: new Uint8Array(Buffer.concat(chunks)) }).formData();
    } catch { throw new InvalidEmblemError('表单格式无效'); }
    const name = await saveUploadedEmblem(classId, form.get('file'));
    return Response.json({ name });
  } catch (error) { return errorResponse(error); }
}
