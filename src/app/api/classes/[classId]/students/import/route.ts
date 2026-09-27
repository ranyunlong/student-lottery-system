import { ForbiddenError, requireClassAccess } from '../../../../../../lib/access';
import { parseExcelStudents } from '../../../../../../features/students/excel';
import { importStudents } from '../../../../../../features/students/service';

type Context = { params: Promise<{ classId: string }> };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;
const classIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function errorResponse(error: unknown): Response {
  if (error instanceof ForbiddenError) return Response.json({ message: '无权访问班级' }, { status: 403 });
  if (error instanceof UploadError) return Response.json({ message: error.message }, { status: error.status });
  throw error;
}

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const expected = new URL(request.url);
    const host = request.headers.get('host');
    if (host) expected.host = host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    if (forwardedProtocol === 'http' || forwardedProtocol === 'https') expected.protocol = `${forwardedProtocol}:`;
    return origin === parsedOrigin.origin && parsedOrigin.origin === expected.origin;
  } catch {
    return false;
  }
}

async function readForm(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type');
  if (!type?.toLowerCase().startsWith('multipart/form-data;')) throw new UploadError('表单格式无效');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST_BYTES)) {
    throw new UploadError('请求内容超过文件上传上限', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError('表单格式无效');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new UploadError('请求内容超过文件上传上限', 413);
    }
    chunks.push(value);
  }
  try {
    return await new Request(request.url, { method: 'POST', headers: { 'content-type': type },
      body: new Uint8Array(Buffer.concat(chunks)) }).formData();
  } catch { throw new UploadError('表单格式无效'); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { classId } = await context.params;
    if (!classIdPattern.test(classId)) throw new UploadError('班级编号无效');
    await requireClassAccess(classId);
    if (!hasSameOrigin(request)) throw new ForbiddenError();
    const form = await readForm(request);
    const intent = form.get('intent');
    if (intent !== 'preview' && intent !== 'confirm') throw new UploadError('导入操作无效');
    const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) throw new UploadError('请选择 .xlsx 文件');
    if (file.size > MAX_FILE_BYTES) throw new UploadError('Excel 文件不能超过 5 MiB', 413);
    const preview = await parseExcelStudents(new Uint8Array(await file.arrayBuffer()));
    if (preview.errors.length) return Response.json(preview, { status: 422 });
    if (!preview.rows.length) return Response.json({ rows: [], errors: [{ line: 0, message: '没有可导入的学生' }] }, { status: 422 });
    if (intent === 'preview') return Response.json(preview);
    const counts = await importStudents(classId, preview.rows);
    return Response.json(counts);
  } catch (error) { return errorResponse(error); }
}
