'use client';

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { archiveStudentAction, importPastedStudentsAction, restoreStudentAction } from '../features/students/actions';
import { parsePastedStudents, type ImportPreview } from '../features/students/parse';

type StudentItem = { id: number; studentNumber: string; name: string; gender: string | null; archived: boolean };
type Mode = 'excel' | 'paste';
type Filter = 'all' | 'active' | 'archived';
const PAGE_SIZE = 50;
const ERROR_PAGE_SIZE = 100;
const inputClass = 'min-h-11 w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700';
const buttonClass = 'min-h-11 rounded px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';

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
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);

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
  async function changeArchive(student: StudentItem) {
    if (!student.archived && !window.confirm('确定归档' + student.name + '？')) return;
    setBusy(true);
    setFeedback(null);
    try {
      const data = new FormData();
      data.set('classId', classId);
      data.set('studentId', String(student.id));
      const result = await (student.archived ? restoreStudentAction(data) : archiveStudentAction(data));
      setFeedback(result);
      if (result.ok) router.refresh();
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : '操作失败，请重试' });
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
    <section aria-labelledby="import-heading" className="space-y-4 border-b border-slate-200 pb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="import-heading" className="text-lg font-semibold">导入学生</h2>
        <span className="text-sm text-slate-600">每批最多 5,000 人</span>
      </div>
      <div role="tablist" aria-label="导入方式" className="flex gap-1 border-b border-slate-200">
        {([['excel', 'Excel 文件'], ['paste', '粘贴导入']] as const).map(([key, label]) =>
          <button id={'import-tab-' + key} key={key} type="button" role="tab" aria-selected={mode === key}
            aria-controls="import-panel" tabIndex={mode === key ? 0 : -1} onKeyDown={(event) => tabKeys(event, key)}
            onClick={() => selectMode(key)} className={buttonClass + ' rounded-b-none border-b-2 ' + (mode === key ? 'border-teal-700 text-teal-900' : 'border-transparent text-slate-600 hover:bg-slate-100')}>
            {label}
          </button>)}
      </div>
      <div id="import-panel" role="tabpanel" aria-labelledby={'import-tab-' + mode} className="space-y-3">
        {mode === 'excel' ? <label className="block space-y-1 text-sm font-medium">选择 Excel 文件
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={selectFile} className={inputClass + ' file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1'} />
        </label> : <div className="space-y-1">
          <label htmlFor="student-paste" className="block text-sm font-medium">粘贴学生数据</label>
          <textarea id="student-paste" rows={5} value={text} onChange={(event) => { setText(event.target.value); clearPreview(); }}
            className={inputClass + ' resize-y'} aria-describedby="paste-format" />
          <p id="paste-format" className="text-sm text-slate-600">每行：学号、姓名、性别（男/女/留空），以制表符分列。</p>
        </div>}
        <button type="button" onClick={showPreview} disabled={busy || (mode === 'excel' ? !file : !text.trim())}
          className={buttonClass + ' border border-teal-700 text-teal-800 hover:bg-teal-50'}>{busy ? '处理中…' : '预览名单'}</button>
      </div>
      {preview && <div className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="font-semibold">预览 <span className="font-normal text-slate-600">{preview.rows.length} 条有效，{preview.errors.length} 项错误</span></h3>
        {!!preview.errors.length && <div role="alert" className="space-y-1 text-sm text-red-700">
          <p className="font-medium">有错误，整批不能提交：</p>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5">{preview.errors
            .slice(currentErrorPage * ERROR_PAGE_SIZE, (currentErrorPage + 1) * ERROR_PAGE_SIZE)
            .map((error, index) =>
              <li key={currentErrorPage * ERROR_PAGE_SIZE + index}>{error.line ? '第 ' + error.line + ' 行：' : '文件：'}{error.message}</li>)}</ul>
          {errorPages > 1 && <nav aria-label="错误分页" className="flex items-center gap-3 text-slate-700">
            <button type="button" disabled={currentErrorPage === 0} onClick={() => setErrorPage(currentErrorPage - 1)}
              className={buttonClass + ' text-teal-800'}>上一组错误</button>
            <span>{currentErrorPage + 1} / {errorPages}</span>
            <button type="button" disabled={currentErrorPage === errorPages - 1} onClick={() => setErrorPage(currentErrorPage + 1)}
              className={buttonClass + ' text-teal-800'}>下一组错误</button>
          </nav>}
        </div>}
        {!!preview.rows.length && <div className="max-h-64 overflow-y-auto border-y border-slate-200 text-sm">
          <ol className="divide-y divide-slate-100">{preview.rows.slice(0, 100).map((row, index) =>
            <li key={index} className="flex flex-wrap gap-x-5 gap-y-1 px-2 py-2">
              <span className="min-w-14 text-slate-500">{index + 1}.</span><span className="break-all font-medium">{row.studentNumber}</span>
              <span className="break-all">{row.name}</span><span>{row.gender === 'male' ? '男' : row.gender === 'female' ? '女' : '未填写'}</span>
            </li>)}</ol>
          {preview.rows.length > 100 && <p className="px-2 py-2 text-slate-600">仅显示前 100 条，提交将包含全部有效行。</p>}
        </div>}
        <button type="button" onClick={confirmImport} disabled={busy || !preview.rows.length || !!preview.errors.length}
          className={buttonClass + ' bg-teal-700 text-white hover:bg-teal-800'}>{busy ? '提交中…' : '确认导入'}</button>
      </div>}
      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-teal-800' : 'text-sm text-red-700'}>{feedback.message}</p>}
    </section>

    <section aria-labelledby="roster-heading" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="roster-heading" className="text-lg font-semibold">学生名单</h2>
        <span className="text-sm text-slate-600">{students.length} 人</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 space-y-1 text-sm font-medium">搜索名单
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            className={inputClass} placeholder="学号或姓名" />
        </label>
        <label className="space-y-1 text-sm font-medium">状态
          <select value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setPage(0); }} className={inputClass}>
            <option value="all">全部</option><option value="active">在册</option><option value="archived">已归档</option>
          </select>
        </label>
      </div>
      {visible.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {visible.map((student) => <li key={student.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="break-all font-mono font-medium">{student.studentNumber}</span><span className="break-all font-medium">{student.name}</span>
            <span className="text-slate-600">{student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : '未填写'}</span>
            {student.archived && <span className="text-amber-800">已归档</span>}
          </div>
          <button type="button" disabled={busy} onClick={() => changeArchive(student)}
            aria-label={(student.archived ? '恢复' : '归档') + student.name}
            className={buttonClass + (student.archived ? ' text-teal-800 hover:bg-teal-50' : ' text-red-700 hover:bg-red-50')}>
            {student.archived ? '恢复' : '归档'}
          </button>
        </li>)}
      </ul> : <p className="py-4 text-sm text-slate-600">{students.length ? '没有符合条件的学生。' : '暂无学生。'}</p>}
      {pages > 1 && <nav aria-label="名单分页" className="flex items-center justify-end gap-3 text-sm">
        <button type="button" className={buttonClass + ' text-teal-800'} disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span>{currentPage + 1} / {pages}</span>
        <button type="button" className={buttonClass + ' text-teal-800'} disabled={currentPage === pages - 1}
          onClick={() => setPage(currentPage + 1)}>下一页</button>
      </nav>}
    </section>
  </div>;
}
