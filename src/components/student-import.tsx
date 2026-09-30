'use client';

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ChevronLeft, ChevronRight, ClipboardPaste, Download, Eye, FileSpreadsheet, Gift, LoaderCircle, RotateCcw, Search, Upload } from 'lucide-react';
import { archiveStudentAction, importPastedStudentsAction, restoreStudentAction } from '../features/students/actions';
import { parsePastedStudents, type ImportPreview } from '../features/students/parse';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { StatusMessage } from './ui/status-message';
import { Textarea } from './ui/textarea';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { cn } from './ui/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

type StudentItem = { id: number; studentNumber: string; name: string; gender: string | null; archived: boolean };
type Mode = 'excel' | 'paste';
type Filter = 'all' | 'active' | 'archived';
const PAGE_SIZE = 50;
const ERROR_PAGE_SIZE = 100;

export function StudentImport({ classId, students }: { classId: string; students: StudentItem[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('excel');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const previewVersion = useRef(0);
  const selectedFileRef = useRef<File | null>(null);
  const activeImport = useRef<number | null>(null);
  const [errorPage, setErrorPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [studentToArchive, setStudentToArchive] = useState<StudentItem | null>(null);

  function clearPreview() {
    previewVersion.current++;
    if (activeImport.current !== null) {
      activeImport.current = null;
      setBusy(false);
    }
    setPreview(null);
    setPreviewFile(null);
    setFeedback(null);
    setErrorPage(0);
  }
  function selectMode(next: Mode) { setMode(next); clearPreview(); }
  function updateRosterSearch(value: string) {
    setDraftQuery(value);
    if (!value) { setQuery(''); setFilter('all'); setPage(0); }
  }
  function submitRosterSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draftQuery.trim());
    setPage(0);
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, current: Mode) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = current === 'excel' ? 'paste' : 'excel';
    selectMode(next);
    document.getElementById('import-tab-' + next)?.focus();
  }
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    selectedFileRef.current = nextFile;
    setFile(nextFile);
    clearPreview();
  }
  async function excelRequest(intent: 'preview' | 'confirm', selectedFile: File) {
    const data = new FormData();
    data.set('file', selectedFile);
    data.set('intent', intent);
    const response = await fetch('/api/classes/' + encodeURIComponent(classId) + '/students/import', { method: 'POST', body: data });
    const result = await response.json();
    if (!response.ok && !result.errors) throw new Error(result.message ?? '文件处理失败');
    return { response, result };
  }
  async function showPreview() {
    if (busy || activeImport.current !== null) return;
    clearPreview();
    const version = previewVersion.current;
    if (mode === 'paste') {
      if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) {
        setFeedback({ ok: false, message: '粘贴内容不能超过 2 MiB' });
        return;
      }
      const result = parsePastedStudents(text);
      if (!result.rows.length && !result.errors.length) result.errors.push({ line: 0, message: '没有可导入的学生' });
      setPreview(result);
      return;
    }
    activeImport.current = version;
    setBusy(true);
    try {
      if (!file) throw new Error('请选择 .xlsx 文件');
      const selectedFile = file;
      const { result } = await excelRequest('preview', selectedFile);
      if (version !== previewVersion.current || activeImport.current !== version || selectedFile !== selectedFileRef.current) return;
      setPreviewFile(selectedFile);
      setPreview(result as ImportPreview);
    } catch (error) {
      if (version === previewVersion.current && activeImport.current === version) {
        setFeedback({ ok: false, message: error instanceof Error ? error.message : '预览失败，请重试' });
      }
    } finally {
      if (activeImport.current === version) {
        activeImport.current = null;
        setBusy(false);
      }
    }
  }
  async function confirmImport() {
    if (!preview?.rows.length || preview.errors.length || busy || activeImport.current !== null) return;
    if (mode === 'excel' && (!previewFile || previewFile !== file)) return;
    const version = previewVersion.current;
    const confirmedFile = mode === 'excel' ? previewFile : null;
    const isCurrent = () => activeImport.current === version && previewVersion.current === version
      && (confirmedFile === null || confirmedFile === selectedFileRef.current);
    activeImport.current = version;
    setBusy(true);
    setFeedback(null);
    try {
      if (mode === 'paste') {
        const data = new FormData();
        data.set('classId', classId);
        data.set('text', text);
        const result = await importPastedStudentsAction(data);
        if (!isCurrent()) {
          if (result.ok) router.refresh();
          return;
        }
        if (!result.ok) {
          if (result.errors) {
            setErrorPage(0);
            setPreview({ rows: preview.rows, errors: result.errors });
          }
          setFeedback({ ok: false, message: result.message });
          return;
        }
        setFeedback({ ok: true, message: '导入完成：新增 ' + result.inserted + '，更新 ' + result.updated });
      } else {
        const { response, result } = await excelRequest('confirm', confirmedFile!);
        if (!isCurrent()) {
          if (response.ok) router.refresh();
          return;
        }
        if (!response.ok) {
          setErrorPage(0);
          setPreview(result as ImportPreview);
          setFeedback({ ok: false, message: '文件有错误，请重新预览' });
          return;
        }
        setFeedback({ ok: true, message: '导入完成：新增 ' + result.inserted + '，更新 ' + result.updated });
      }
      setPreview(null);
      router.refresh();
    } catch (error) {
      if (isCurrent()) setFeedback({ ok: false, message: error instanceof Error ? error.message : '导入失败，请重试' });
    } finally {
      if (activeImport.current === version) {
        activeImport.current = null;
        setBusy(false);
      }
    }
  }
  async function changeArchive(student: StudentItem): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const data = new FormData();
      data.set('classId', classId);
      data.set('studentId', String(student.id));
      const result = await (student.archived ? restoreStudentAction(data) : archiveStudentAction(data));
      setFeedback(result);
      if (result.ok) router.refresh();
      return result.ok;
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : '操作失败，请重试' });
      return false;
    } finally { setBusy(false); }
  }

  const searched = students.filter((student) =>
    (filter === 'all' || (filter === 'archived') === student.archived)
    && (student.studentNumber.includes(query.trim()) || student.name.includes(query.trim())));
  const pages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = searched.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const errorPages = Math.max(1, Math.ceil((preview?.errors.length ?? 0) / ERROR_PAGE_SIZE));
  const currentErrorPage = Math.min(errorPage, errorPages - 1);

  return <div className="min-w-0 space-y-7">
    <div className="flex justify-end">
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="w-full sm:w-auto" icon={<Upload aria-hidden="true" className="size-4" />}>导入学生</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader className="pr-0">
          <div className="pr-10"><DialogTitle>导入学生</DialogTitle>
          <DialogDescription className="mt-2">上传 Excel 名单，或粘贴学生数据后预览。</DialogDescription></div>
          <div className="flex justify-end"><Badge>每批最多 5,000 人</Badge></div>
        </DialogHeader>
        <section aria-label="学生导入" className="min-w-0 space-y-4">
          <div className="space-y-5 rounded-md border border-workspace-line bg-white p-4 sm:p-5">
      <div role="tablist" aria-label="导入方式" className="flex w-fit max-w-full gap-1 rounded-md bg-workspace-surface-alt p-1">
        {([['excel', 'Excel 文件', FileSpreadsheet], ['paste', '粘贴导入', ClipboardPaste]] as const).map(([key, label, Icon]) =>
          <Button id={'import-tab-' + key} key={key} type="button" variant="ghost" size="sm" role="tab" aria-selected={mode === key}
            aria-controls="import-panel" tabIndex={mode === key ? 0 : -1} onKeyDown={(event) => tabKeys(event, key)}
            onClick={() => selectMode(key)} className={cn('rounded border-0', mode === key ? 'bg-white text-workspace-accent-strong shadow-sm' : 'text-workspace-muted')}>
            <Icon aria-hidden="true" className="size-4" />{label}
          </Button>)}
      </div>
      <div id="import-panel" role="tabpanel" aria-labelledby={'import-tab-' + mode} className="space-y-3">
        {mode === 'excel' ? <div className="flex flex-wrap items-end gap-3">
          <Field label="选择 Excel 文件" htmlFor="student-excel-file" className="min-w-0 flex-[1_1_16rem]">
            <Input id="student-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={selectFile} className="file:mr-3 file:rounded file:border-0 file:bg-workspace-surface-alt file:px-2 file:py-1 file:font-medium file:text-workspace-ink" />
          </Field>
          <Button asChild variant="secondary">
            <a href={'/api/classes/' + encodeURIComponent(classId) + '/students/import'} download>
              <Download aria-hidden="true" className="size-4" />下载 Excel 模板
            </a>
          </Button>
        </div> : <Field label="粘贴学生数据" htmlFor="student-paste" hint={<span id="paste-format">每行：学号、姓名、性别（男/女/留空），以制表符分列。</span>}>
          <Textarea id="student-paste" rows={5} value={text} onChange={(event) => { setText(event.target.value); clearPreview(); }}
            aria-describedby="paste-format" />
        </Field>}
        <Button type="button" variant="secondary" onClick={showPreview} disabled={busy || (mode === 'excel' ? !file : !text.trim())}
          icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Eye aria-hidden="true" className="size-4" />}>{busy ? '处理中…' : '预览名单'}</Button>
      </div>
      {preview && <div className="space-y-3 border-t border-workspace-line pt-4">
        <h3 className="font-semibold text-workspace-ink">预览 <span className="font-normal text-workspace-muted">{preview.rows.length} 条有效，{preview.errors.length} 项错误</span></h3>
        {!!preview.errors.length && <StatusMessage role="alert" tone="error" className="block">
          <div className="space-y-2"><p className="font-medium">有错误，整批不能提交：</p>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5">{preview.errors
            .slice(currentErrorPage * ERROR_PAGE_SIZE, (currentErrorPage + 1) * ERROR_PAGE_SIZE)
            .map((error, index) =>
              <li key={currentErrorPage * ERROR_PAGE_SIZE + index}>{error.line ? '第 ' + error.line + ' 行：' : '文件：'}{error.message}</li>)}</ul>
          {errorPages > 1 && <nav aria-label="错误分页" className="flex items-center gap-3 text-workspace-muted">
            <Button type="button" variant="quiet" size="sm" disabled={currentErrorPage === 0} onClick={() => setErrorPage(currentErrorPage - 1)} icon={<ChevronLeft aria-hidden="true" className="size-4" />}>上一组错误</Button>
            <span>{currentErrorPage + 1} / {errorPages}</span>
            <Button type="button" variant="quiet" size="sm" disabled={currentErrorPage === errorPages - 1} onClick={() => setErrorPage(currentErrorPage + 1)}>下一组错误<ChevronRight aria-hidden="true" className="size-4" /></Button>
          </nav>}
          </div>
        </StatusMessage>}
        {!!preview.rows.length && <div className="max-h-64 overflow-y-auto border-y border-workspace-line text-sm">
          <ol className="divide-y divide-workspace-line">{preview.rows.slice(0, 100).map((row, index) =>
            <li key={index} className="flex flex-wrap gap-x-5 gap-y-1 px-2 py-2">
              <span className="min-w-14 text-workspace-muted">{index + 1}.</span><span className="break-all font-mono font-medium">{row.studentNumber}</span>
              <span className="break-all text-workspace-ink">{row.name}</span><span className="text-workspace-muted">{row.gender === 'male' ? '男' : row.gender === 'female' ? '女' : '未填写'}</span>
            </li>)}</ol>
          {preview.rows.length > 100 && <p className="px-2 py-2 text-workspace-muted">仅显示前 100 条，提交将包含全部有效行。</p>}
        </div>}
        <Button type="button" onClick={confirmImport} disabled={busy || !preview.rows.length || !!preview.errors.length}
          icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : undefined}>{busy ? '提交中…' : '确认导入'}</Button>
      </div>}
      {feedback && <StatusMessage role={feedback.ok ? 'status' : 'alert'} tone={feedback.ok ? 'success' : 'error'}>{feedback.message}</StatusMessage>}
          </div>
        </section>
      </DialogContent>
    </Dialog>
    </div>
    <Dialog open={studentToArchive !== null} onOpenChange={(open) => { if (!open && !busy) setStudentToArchive(null); }}>
      {studentToArchive && <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>归档学生：{studentToArchive.name}</DialogTitle></DialogHeader>
        <DialogDescription>归档后，该学生将不再参与新抽奖。历史中奖记录仍会保留。</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setStudentToArchive(null)}>取消</Button>
          <Button type="button" variant="destructive" disabled={busy} loading={busy} onClick={async () => {
            if (await changeArchive(studentToArchive)) setStudentToArchive(null);
          }}>确认</Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>

    <section aria-label="学生名单" className="min-w-0 space-y-4">
      <form onSubmit={submitRosterSearch} className="grid gap-3 rounded-md border border-workspace-line bg-workspace-surface p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <Field label="搜索名单" htmlFor="student-roster-search" className="min-w-0"><Input id="student-roster-search" type="search" value={draftQuery} onChange={(event) => updateRosterSearch(event.target.value)} placeholder="学号或姓名" /></Field>
        <Field label="状态" htmlFor="student-roster-status" className="min-w-0"><Select id="student-roster-status" value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setPage(0); }}>
            <option value="all">全部</option><option value="active">在册</option><option value="archived">已归档</option>
          </Select></Field>
        <Button type="submit" icon={<Search aria-hidden="true" className="size-4" />}>查找</Button>
      </form>
      {visible.length ? <div className="rounded-md border border-workspace-line bg-white">
        <Table className="min-w-[56rem]">
          <TableCaption className="sr-only">学生名单</TableCaption>
          <TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead>性别</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>{visible.map((student) => <TableRow key={student.id}>
            <TableCell><span className="sr-only">学号</span><span className="break-all font-mono font-medium">{student.studentNumber}</span></TableCell>
            <TableCell><span className="sr-only">姓名</span><span className="break-words font-medium">{student.name}</span></TableCell>
            <TableCell><span className="sr-only">性别</span>{student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : '未填写'}</TableCell>
            <TableCell><span className="sr-only">状态</span>{student.archived ? <Badge tone="warning">已归档</Badge> : <span>在册</span>}</TableCell>
            <TableCell><span className="sr-only">操作</span><div className="flex min-w-0 flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary"><Link href={`/classes/${classId}/winnings?studentId=${student.id}`} aria-label={`查看${student.name}待兑换奖品`}><Gift aria-hidden="true" className="size-4" />待兑奖品</Link></Button>
              <Button type="button" size="sm" variant={student.archived ? 'secondary' : 'danger'} disabled={busy}
              onClick={() => { if (student.archived) void changeArchive(student); else setStudentToArchive(student); }}
              aria-label={(student.archived ? '恢复' : '归档') + student.name}
              icon={student.archived ? <RotateCcw aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />}>
              {student.archived ? '恢复' : '归档'}
            </Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : <EmptyState title={students.length ? '没有符合条件的学生。' : '暂无学生。'} />}
      {pages > 1 && <nav aria-label="名单分页" className="flex items-center justify-end gap-2 text-sm">
        <Button type="button" variant="quiet" size="sm" disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)} icon={<ChevronLeft aria-hidden="true" className="size-4" />}>上一页</Button>
        <span className="tabular-nums text-workspace-muted">{currentPage + 1} / {pages}</span>
        <Button type="button" variant="quiet" size="sm" disabled={currentPage === pages - 1}
          onClick={() => setPage(currentPage + 1)}>下一页<ChevronRight aria-hidden="true" className="size-4" /></Button>
      </nav>}
    </section>
  </div>;
}
