'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { PrizeImportPreview } from '../features/prizes/excel';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export function PrizeImportDialog({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PrizeImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestVersion = useRef(0);
  const url = `/api/classes/${encodeURIComponent(classId)}/prizes/import`;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    requestVersion.current++;
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setMessage('');
    setBusy(false);
  }

  async function request(intent: 'preview' | 'confirm') {
    if (!file || busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setMessage('');
    const selected = file;
    try {
      const form = new FormData();
      form.set('file', selected);
      form.set('intent', intent);
      const response = await fetch(url, { method: 'POST', body: form });
      const result = await response.json();
      if (version !== requestVersion.current) {
        if (intent === 'confirm' && response.ok) router.refresh();
        return;
      }
      if (!response.ok && !result.errors) throw new Error(result.message ?? '导入失败');
      if (intent === 'preview' || !response.ok) {
        setPreview(result as PrizeImportPreview);
        if (!response.ok) setMessage('请修正文件中的错误后重新预览');
      } else {
        setOpen(false);
        setFile(null);
        setPreview(null);
        router.refresh();
      }
    } catch (error) { if (version === requestVersion.current) setMessage(error instanceof Error ? error.message : '导入失败'); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (busy) return; setOpen(next); if (!next) { setPreview(null); setFile(null); setMessage(''); } }}>
    <DialogTrigger asChild><Button type="button" variant="secondary" icon={<Upload aria-hidden="true" className="size-4" />}>导入奖品</Button></DialogTrigger>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>导入奖品</DialogTitle><DialogDescription>下载模板，填写奖品名称与补充数量，再上传预览；同名奖品将增加库存。</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <a href={url} download><Download aria-hidden="true" className="size-4" />下载 Excel 模板</a>
        </Button>
        <Field label="选择 Excel 文件" htmlFor="prize-import-file" className="w-full">
          <Input id="prize-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} />
        </Field>
        {message && <p role="alert" className="text-sm text-workspace-danger">{message}</p>}
        {preview?.errors.length ? <div className="max-h-32 overflow-y-auto rounded-md border border-workspace-danger/20 bg-red-50 p-3 text-sm text-workspace-danger">
          {preview.errors.map((error, index) => <p key={index}>第 {error.line} 行：{error.message}</p>)}
        </div> : null}
        {preview?.rows.length ? <div className="max-h-60 overflow-y-auto rounded-md border border-workspace-line">
          <Table><TableHeader><TableRow><TableHead>奖品名称</TableHead><TableHead>补充数量</TableHead></TableRow></TableHeader>
            <TableBody>{preview.rows.map((row) => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell>{row.quantity}</TableCell></TableRow>)}</TableBody></Table>
        </div> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
        {!preview || preview.errors.length ? <Button type="button" disabled={!file || busy} loading={busy} onClick={() => request('preview')}
          icon={<FileSpreadsheet aria-hidden="true" className="size-4" />}>预览</Button>
          : <Button type="button" disabled={busy || !preview.rows.length} loading={busy} onClick={() => request('confirm')}>确认</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
