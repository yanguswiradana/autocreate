<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessVideoEditJob;
use App\Models\VideoEdit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class VideoEditController extends Controller
{
    private function mediaRoot(): string
    {
        return rtrim((string) env('SHARED_MEDIA_DIR', '/app/shared_media'), '/');
    }

    public function index(): JsonResponse
    {
        $edits = VideoEdit::latest()->limit(50)->get();
        return response()->json(['edits' => $edits]);
    }

    public function show(int $id): JsonResponse
    {
        $edit = VideoEdit::findOrFail($id);
        return response()->json(['edit' => $edit]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/quicktime,video/webm', 'max:204800'],
            'title' => ['nullable', 'string', 'max:200'],
            'trimStart' => ['nullable', 'numeric', 'min:0'],
            'trimEnd' => ['nullable', 'numeric', 'min:0'],
            'removeSilence' => ['nullable'],
            'aspectRatio' => ['nullable', 'string', 'in:9:16,4:5,1:1,16:9,original'],
            'bgMask' => ['nullable', 'string', 'in:none,blur,solid_dark,green_screen'],
            'autoSubtitle' => ['nullable'],
            'language' => ['nullable', 'string', 'in:id,en'],
            'hookText' => ['nullable', 'string', 'max:120'],
        ]);

        $file = $request->file('video');
        $uploadDir = $this->mediaRoot() . '/uploads';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        $ext = $file->getClientOriginalExtension() ?: 'mp4';
        $filename = date('Ymd_His') . '_' . Str::random(8) . '.' . $ext;
        $file->move($uploadDir, $filename);

        $title = trim((string) ($validated['title'] ?? ''));
        if ($title === '') {
            $title = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME) ?: 'Video Take';
        }

        $options = [
            'trimStart' => isset($validated['trimStart']) ? (float) $validated['trimStart'] : null,
            'trimEnd' => isset($validated['trimEnd']) ? (float) $validated['trimEnd'] : null,
            'removeSilence' => filter_var($request->input('removeSilence', false), FILTER_VALIDATE_BOOLEAN),
            'aspectRatio' => $validated['aspectRatio'] ?? '9:16',
            'bgMask' => $validated['bgMask'] ?? 'none',
            'autoSubtitle' => filter_var($request->input('autoSubtitle', false), FILTER_VALIDATE_BOOLEAN),
            'language' => $validated['language'] ?? 'id',
            'hookText' => $validated['hookText'] ?? null,
        ];

        $edit = VideoEdit::create([
            'title' => $title,
            'input_path' => "uploads/{$filename}",
            'status' => 'queued',
            'options' => $options,
        ]);

        ProcessVideoEditJob::dispatch($edit->id);

        return response()->json(['ok' => true, 'edit' => $edit], 202);
    }

    public function download(int $id): BinaryFileResponse|JsonResponse
    {
        $edit = VideoEdit::findOrFail($id);
        if (!$edit->output_path) {
            return response()->json(['error' => 'Hasil video belum siap.'], 404);
        }

        $fullPath = $this->mediaRoot() . '/' . ltrim($edit->output_path, '/');
        if (!file_exists($fullPath)) {
            return response()->json(['error' => 'File hasil tidak ditemukan.'], 404);
        }

        return response()->file($fullPath, [
            'Content-Type' => 'video/mp4',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $edit = VideoEdit::findOrFail($id);
        $root = $this->mediaRoot();

        foreach ([$edit->input_path, $edit->output_path] as $rel) {
            if ($rel) {
                $p = $root . '/' . ltrim($rel, '/');
                if (file_exists($p)) {
                    @unlink($p);
                }
            }
        }

        $edit->delete();
        return response()->json(['ok' => true]);
    }
}
