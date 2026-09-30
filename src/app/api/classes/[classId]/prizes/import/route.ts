import { ForbiddenError, requireClassAccess } from '../../../../../../lib/access';
import { createPrizeImportTemplate, parseExcelPrizes } from '../../../../../../features/prizes/excel';
import { importPrizes } from '../../../../../../features/prizes/service';

type Context = { params: Promise<{ classId: string }> };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function errorResponse(error: unknown): Response {
  if (error instanceof ForbiddenError) return Response.json({ message: '无权访问班级' }, { status: 403 });
  if (error instanceof UploadError) return Response.json({ message: error.message }, { status: error.status });
  throw error;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const expected = new URL(request.url);
    const host = request.headers.get('host');
    if (host) expected.host = host;
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    if (protocol === 'http' || protocol === 'https') expected.protocol = `${protocol}:`;
    return new URL(origin).origin === origin && origin === expected.origin;
  } catch { return false; }
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
    if (length > MAX_REQUEST_BYTES) { await reader.cancel(); throw new UploadError('请求内容超过文件上传上限', 413); }
    chunks.push(value);
  }
  try {
    return await new Request(request.url, { method: 'POST', headers: { 'content-type': type },
      body: new Uint8Array(Buffer.concat(chunks)) }).formData();
  } catch { throw new UploadError('表单格式无效'); }
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const { classId } = await context.params;
    if (!uuid.test(classId)) throw new UploadError('班级编号无效');
    await requireClassAccess(classId);
    const bytes = await createPrizeImportTemplate();
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prize-import-template.xlsx"; filename*=UTF-8''${encodeURIComponent('奖品导入模板.xlsx')}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { classId } = await context.params;
    if (!uuid.test(classId)) throw new UploadError('班级编号无效');
    await requireClassAccess(classId);
    if (!sameOrigin(request)) throw new ForbiddenError();
    const form = await readForm(request);
    const intent = form.get('intent');
    if (intent !== 'preview' && intent !== 'confirm') throw new UploadError('导入操作无效');
    const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) throw new UploadError('请选择 .xlsx 文件');
    if (file.size > MAX_FILE_BYTES) throw new UploadError('Excel 文件不能超过 5 MiB', 413);
    const preview = await parseExcelPrizes(new Uint8Array(await file.arrayBuffer()));
    if (preview.errors.length) return Response.json(preview, { status: 422 });
    if (!preview.rows.length) return Response.json({ rows: [], errors: [{ line: 0, message: '没有可导入的奖品' }] }, { status: 422 });
    if (intent === 'preview') return Response.json(preview);
    try { return Response.json(await importPrizes(classId, preview.rows)); }
    catch (error) {
      if (error instanceof Error && error.message.includes('库存数量超出范围')) {
        return Response.json({ message: error.message }, { status: 422 });
      }
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}
