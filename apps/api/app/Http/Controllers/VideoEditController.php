<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessVideoEditJob;
use App\Models\ProviderKey;
use App\Models\VideoEdit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
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

    public function analyzeReference(Request $request): JsonResponse
    {
        $request->validate([
            'video' => ['required', 'file', 'mimes:mp4,mov,webm,mkv', 'max:153600'],
        ]);

        $file = $request->file('video');
        $ext = strtolower($file->getClientOriginalExtension() ?: 'mp4');
        $tmpDir = $this->mediaRoot() . '/tmp';
        if (!is_dir($tmpDir)) {
            mkdir($tmpDir, 0775, true);
        }

        $filename = 'ref_' . now()->format('Ymd_His') . '_' . Str::random(8) . '.' . $ext;
        $file->move($tmpDir, $filename);
        $fullPath = "{$tmpDir}/{$filename}";

        try {
            $videoAiUrl = rtrim((string) env('VIDEO_AI_URL', 'http://video-ai:8090'), '/');
            $res = Http::timeout(120)->post("{$videoAiUrl}/analyze-reference", [
                'inputPath' => $fullPath,
            ]);

            if ($res->failed()) {
                return response()->json([
                    'error' => 'Gagal menganalisis video referensi: ' . $res->body(),
                ], 502);
            }

            $analysis = $res->json();
            $analysis['aiVision'] = $this->analyzeKeyframesWithGemini($analysis['keyframes'] ?? []);

            return response()->json($analysis);
        } finally {
            if (file_exists($fullPath)) {
                @unlink($fullPath);
            }
        }
    }

    private function analyzeKeyframesWithGemini(array $keyframes): ?array
    {
        if (count($keyframes) === 0) {
            return null;
        }

        $apiKeys = ProviderKey::activeMap();
        $geminiKey = trim((string) ($apiKeys['gemini'] ?? env('GEMINI_API_KEY', '')));
        if ($geminiKey === '') {
            return null;
        }

        $parts = [
            [
                'text' => 'Analisis 4 keyframe video referensi ini. Kembalikan JSON dengan tepat 3 field string bahasa Indonesia: {"suggestedTopic": "...", "suggestedHook": "...", "styleSummary": "..."}. Ringkas dan langsung bisa dipakai untuk membuat konten carousel/video baru.',
            ],
        ];

        foreach (array_slice($keyframes, 0, 4) as $dataUri) {
            if (!is_string($dataUri)) {
                continue;
            }
            $b64 = preg_replace('/^data:image\/[a-zA-Z0-9+.-]+;base64,/', '', $dataUri);
            if ($b64) {
                $parts[] = [
                    'inline_data' => [
                        'mime_type' => 'image/jpeg',
                        'data' => $b64,
                    ],
                ];
            }
        }

        try {
            $resp = Http::timeout(25)->post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$geminiKey}",
                [
                    'contents' => [['parts' => $parts]],
                    'generationConfig' => [
                        'responseMimeType' => 'application/json',
                        'temperature' => 0.4,
                    ],
                ]
            );

            if ($resp->failed()) {
                return null;
            }

            $text = $resp->json('candidates.0.content.parts.0.text');
            if (!is_string($text) || trim($text) === '') {
                return null;
            }

            $parsed = json_decode($text, true);
            if (!is_array($parsed) || empty($parsed['suggestedTopic'])) {
                return null;
            }

            return [
                'suggestedTopic' => (string) $parsed['suggestedTopic'],
                'suggestedHook' => (string) ($parsed['suggestedHook'] ?? ''),
                'styleSummary' => (string) ($parsed['styleSummary'] ?? ''),
            ];
        } catch (\Throwable) {
            return null;
        }
    }
}
