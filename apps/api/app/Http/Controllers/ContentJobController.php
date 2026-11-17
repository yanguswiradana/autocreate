<?php

namespace App\Http\Controllers;

use App\Jobs\DispatchRenderJob;
use App\Models\ContentJob;
use App\Models\ProviderKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ContentJobController extends Controller
{
    private function rendererUrl(): string
    {
        return rtrim(env('RENDERER_URL', 'http://127.0.0.1:4173'), '/');
    }

    public function health(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'service' => 'autocreate-api',
            'db' => config('database.default'),
        ]);
    }

    public function index(): JsonResponse
    {
        $jobs = ContentJob::latest()->limit(100)->get();
        return response()->json(['jobs' => $jobs]);
    }

    public function show(int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        return response()->json(['job' => $job]);
    }

    private function sharedJobRules(): array
    {
        return [
            'preset' => ['nullable', 'string', 'in:noir_editorial,midnight_tech,monochrome_luxury,warm_cinematic,neon_cyber,clean_paper'],
            'series' => ['nullable', 'string', 'in:edukasi,fakta_cepat,storytelling,promo_brand'],
            'aspectRatio' => ['nullable', 'string', 'in:4:5,1:1,9:16,16:9'],
            'language' => ['nullable', 'string', 'in:id,en'],
            'outputs' => ['nullable', 'array', 'min:1'],
            'options' => ['nullable', 'array'],
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate(array_merge([
            'topic' => ['nullable', 'string', 'max:500'],
            'referenceUrls' => ['nullable', 'array', 'max:4'],
        ], $this->sharedJobRules()));

        $topic = trim((string) ($validated['topic'] ?? ''));
        $refUrls = array_values(array_filter($validated['referenceUrls'] ?? []));

        if ($topic === '' && count($refUrls) === 0) {
            return response()->json([
                'error' => 'Topik atau minimal 1 Link Referensi wajib diisi.',
            ], 422);
        }

        $job = ContentJob::create([
            'topic' => $topic !== '' ? $topic : ($refUrls[0] ?? 'Ringkasan Referensi'),
            'preset' => $validated['preset'] ?? 'noir_editorial',
            'series' => $validated['series'] ?? 'edukasi',
            'aspect_ratio' => $validated['aspectRatio'] ?? '4:5',
            'language' => $validated['language'] ?? 'id',
            'outputs' => $validated['outputs'] ?? ['carousel', 'video'],
            'reference_urls' => $refUrls,
            'options' => $validated['options'] ?? [],
            'status' => 'queued',
            'source' => 'web',
        ]);

        DispatchRenderJob::dispatch($job->id);

        return response()->json(['ok' => true, 'job' => $job], 202);
    }

    public function batch(Request $request): JsonResponse
    {
        $validated = $request->validate(array_merge([
            'topics' => ['required', 'array', 'min:1', 'max:20'],
            'topics.*' => ['required', 'string', 'max:500'],
        ], $this->sharedJobRules()));

        $batchId = 'batch_' . Str::lower(Str::random(10));
        $created = [];

        foreach ($validated['topics'] as $rawTopic) {
            $topic = trim($rawTopic);
            if ($topic === '') {
                continue;
            }
            $job = ContentJob::create([
                'topic' => $topic,
                'preset' => $validated['preset'] ?? 'noir_editorial',
                'series' => $validated['series'] ?? 'edukasi',
                'aspect_ratio' => $validated['aspectRatio'] ?? '4:5',
                'language' => $validated['language'] ?? 'id',
                'outputs' => $validated['outputs'] ?? ['carousel', 'video'],
                'options' => $validated['options'] ?? [],
                'status' => 'queued',
                'source' => 'batch',
                'batch_id' => $batchId,
            ]);
            DispatchRenderJob::dispatch($job->id);
            $created[] = $job;
        }

        return response()->json([
            'ok' => true,
            'batchId' => $batchId,
            'jobs' => $created,
        ], 202);
    }

    public function batchStatus(string $batchId): JsonResponse
    {
        $jobs = ContentJob::where('batch_id', $batchId)->orderBy('id')->get();
        return response()->json([
            'batchId' => $batchId,
            'jobs' => $jobs,
        ]);
    }

    public function webhook(Request $request, int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        $manifest = $request->input('manifest');
        $finishedAt = now();
        $startedAt = $job->started_at ?? $job->created_at ?? $finishedAt;

        $job->update([
            'status' => 'completed',
            'manifest' => $manifest,
            'folder_name' => $manifest['folderName'] ?? $manifest['jobId'] ?? $job->folder_name,
            'finished_at' => $finishedAt,
            'duration_ms' => (int) $startedAt->diffInMilliseconds($finishedAt),
        ]);

        return response()->json(['ok' => true]);
    }

    public function destroy(int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        if ($job->folder_name) {
            Http::timeout(10)->delete(
                "{$this->rendererUrl()}/api/outputs/" . urlencode($job->folder_name)
            );
        }
        $job->delete();
        return response()->json(['ok' => true]);
    }

    public function extractUrls(Request $request): JsonResponse
    {
        $res = Http::timeout(25)->post("{$this->rendererUrl()}/api/extract-urls", [
            'urls' => $request->input('urls', []),
        ]);
        return response()->json($res->json(), $res->status());
    }

    public function discover(Request $request): JsonResponse
    {
        $res = Http::timeout(25)->post("{$this->rendererUrl()}/api/discover", [
            'count' => $request->input('count', 4),
            'mock' => $request->boolean('mock', false),
        ]);
        return response()->json($res->json(), $res->status());
    }

    public function retry(int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        $job->update([
            'status' => 'queued',
            'error_message' => null,
            'started_at' => null,
            'finished_at' => null,
            'duration_ms' => null,
        ]);

        DispatchRenderJob::dispatch($job->id);

        return response()->json(['ok' => true, 'job' => $job->fresh()], 202);
    }

    public function rerender(Request $request, int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        $folderName = $job->folder_name ?: ($job->manifest['jobId'] ?? null);
        if (!$folderName) {
            return response()->json(['error' => 'Project folder belum tersedia.'], 400);
        }

        $res = Http::timeout(300)->post("{$this->rendererUrl()}/api/rerender", [
            'folderName' => $folderName,
            'blueprint' => $request->input('blueprint'),
            'outputs' => $request->input('outputs', $job->outputs ?: ['carousel']),
            'customSceneImages' => $request->input('customSceneImages'),
            'voice' => $request->input('voice'),
            'bgm' => $request->input('bgm'),
            'bgmVolume' => $request->input('bgmVolume'),
        ]);

        if ($res->ok()) {
            $data = $res->json();
            $job->update([
                'folder_name' => $folderName,
                'blueprint' => $request->input('blueprint') ?? $job->blueprint,
                'manifest' => $data['manifest'] ?? $job->manifest,
            ]);
        }

        return response()->json($res->json(), $res->status());
    }

    public function chatIntent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'mock' => ['sometimes', 'boolean'],
            'knownUrls' => ['sometimes', 'array', 'max:4'],
            'history' => ['sometimes', 'array', 'max:8'],
        ]);

        $raw = trim($validated['message']);
        $mock = (bool) ($validated['mock'] ?? false);
        preg_match_all('/https?:\/\/[^\s]+/i', $raw, $urlMatches);
        $msgUrls = array_values(array_unique($urlMatches[0] ?? []));
        $knownUrls = array_values(array_filter(array_map('strval', $validated['knownUrls'] ?? [])));
        $urls = array_values(array_unique(array_merge($knownUrls, $msgUrls)));
        $history = $validated['history'] ?? [];
        $textOnly = trim((string) preg_replace('/https?:\/\/[^\s]+/i', '', $raw));

        $heuristic = $this->heuristicIntent($raw, $textOnly, $urls);

        if ($mock) {
            return response()->json($heuristic);
        }

        $aiResult = $this->classifyIntentWithAi($raw, $urls, $history);
        if ($aiResult !== null) {
            // Never lose known/detected URLs or get stuck in clarify when we already have URLs + direction
            $merged = array_merge($heuristic, $aiResult, ['urls' => $urls]);
            if (count($urls) > 0 && ($merged['intent'] ?? '') === 'clarify') {
                $merged['intent'] = 'link_with_instruction';
                if (empty($merged['cleanTopic'])) {
                    $merged['cleanTopic'] = $heuristic['cleanTopic'];
                }
            }
            return response()->json($merged);
        }

        return response()->json($heuristic);
    }

    private function heuristicIntent(string $raw, string $textOnly, array $urls): array
    {
        $lower = mb_strtolower($raw);
        $hasQuestion = str_contains($raw, '?')
            || preg_match('/^(halo|hai|hi|cara|bagaimana|gimana|apa itu|kenapa)\b/i', $lower) === 1;

        $outputs = null;
        $aspectRatio = null;
        $visualProvider = null;
        $slides = null;
        if (preg_match('/\b(reels|tiktok|shorts|video)\b/i', $lower)) {
            $outputs = ['video'];
            $aspectRatio = '9:16';
        } elseif (preg_match('/\b(feed|carousel|slide|ig)\b/i', $lower)) {
            $outputs = ['carousel'];
            $aspectRatio = '4:5';
        } elseif (preg_match('/\b(poster|flyer|infografis)\b/i', $lower)) {
            $outputs = ['poster'];
            $aspectRatio = '4:5';
        }
        if (preg_match('/\b(3|5|7|10)\s*slide\b/i', $lower, $sm)) {
            $slides = (int) $sm[1];
        }
        if (preg_match('/(background|backgroud|latar|gambar|foto|ilustrasi|visual|carikan)/i', $lower)) {
            $visualProvider = 'wikimedia';
        }

        if (count($urls) > 0) {
            $cleanInstr = trim((string) preg_replace('/^(aku mau |saya ingin |tolong |coba )?(bikin|buat|buatkan|membuat)\s+(konten\s+)?(feed|carousel|video|reels|poster)?\s*(dari\s+)?(berita|link|artikel)?\s*(ini)?/i', '', $textOnly));
            $slugTopic = $this->slugTopicFromUrl($urls[0]);
            return [
                'intent' => 'link_with_instruction',
                'urls' => $urls,
                'cleanTopic' => $slugTopic,
                'instruction' => $cleanInstr ?: $textOnly,
                'suggestedOutputs' => $outputs,
                'suggestedAspectRatio' => $aspectRatio,
                'suggestedVisualProvider' => $visualProvider,
                'suggestedSlides' => $slides,
                'suggestedSeries' => null,
                'assistantReply' => 'Oke, saya tangkap Anda ingin mengolah link referensi tersebut'
                    . ($outputs ? ' menjadi format ' . implode(', ', $outputs) . ($aspectRatio ? " ({$aspectRatio})" : '') : '')
                    . ($slides ? " ({$slides} slide)" : '')
                    . ($visualProvider ? ' dengan pencarian foto internet (Wikimedia)' : '')
                    . '. Saya proses linknya sekarang ya.',
                'source' => 'heuristic',
            ];
        }

        if ($hasQuestion && mb_strlen($raw) < 120) {
            return [
                'intent' => 'clarify',
                'urls' => [],
                'cleanTopic' => '',
                'instruction' => '',
                'suggestedOutputs' => null,
                'suggestedAspectRatio' => null,
                'suggestedVisualProvider' => null,
                'suggestedSlides' => null,
                'suggestedSeries' => null,
                'assistantReply' => 'Siap! Untuk mulai membuat konten, Anda bisa tulis topik utamanya, tempel link berita + arahan (misal: "buatkan feed dari berita ini https://..."), atau klik @Remix untuk mengolah proyek lama.',
                'source' => 'heuristic',
            ];
        }

        $cleaned = trim((string) preg_replace('/^(aku mau |saya ingin |tolong |coba )?(bikin|buat|buatkan|membuat)\s+(konten\s+)?(feed|carousel|video|reels|poster)?\s*(tentang\s+|soal\s+)?/i', '', $textOnly));
        return [
            'intent' => 'topic_brief',
            'urls' => [],
            'cleanTopic' => $cleaned !== '' ? $cleaned : $textOnly,
            'instruction' => '',
            'suggestedOutputs' => $outputs,
            'suggestedAspectRatio' => $aspectRatio,
            'suggestedVisualProvider' => $visualProvider,
            'suggestedSlides' => $slides,
            'suggestedSeries' => null,
            'assistantReply' => 'Siap, saya arahkan ke brief topik "' . ($cleaned !== '' ? $cleaned : $textOnly) . '"'
                . ($outputs ? ' dengan format ' . implode(', ', $outputs) . ($aspectRatio ? " ({$aspectRatio})" : '') : '')
                . ($slides ? " ({$slides} slide)" : '')
                . ($visualProvider ? ' dan pencarian foto internet (Wikimedia)' : '')
                . '. Silakan pilih opsi detail di bawah.',
            'source' => 'heuristic',
        ];
    }

    private function slugTopicFromUrl(string $url): string
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $segments = array_values(array_filter(explode('/', trim($path, '/'))));
        if (count($segments) === 0) {
            return '';
        }
        $last = end($segments);
        $last = (string) preg_replace('/\.(html?|php|aspx?)$/i', '', (string) $last);
        $words = trim((string) preg_replace('/[-_]+/', ' ', $last));
        if (mb_strlen($words) < 6) {
            return '';
        }
        return ucwords($words);
    }

    private function classifyIntentWithAi(string $raw, array $urls, array $history = []): ?array
    {
        $keys = ProviderKey::activeMap();
        $models = ProviderKey::activeModels();
        $geminiKey = trim((string) ($keys['gemini'] ?? env('GEMINI_API_KEY', '')));
        $opencodeKey = trim((string) ($keys['opencode'] ?? env('OPENCODE_API_KEY', '')));

        $historyLines = [];
        foreach (array_slice($history, -6) as $h) {
            if (is_array($h) && !empty($h['text'])) {
                $role = ($h['from'] ?? '') === 'user' ? 'User' : 'AI';
                $historyLines[] = "{$role}: " . mb_substr((string) $h['text'], 0, 260);
            }
        }
        $historyBlock = count($historyLines) > 0 ? "\nRiwayat chat:\n" . implode("\n", $historyLines) . "\n" : '';
        $urlsBlock = count($urls) > 0 ? "\nURL yang sudah diketahui: " . implode(', ', $urls) . "\n" : '';

        $prompt = "Analisis pesan user untuk studio pembuat konten sosmed. Kembalikan JSON valid dengan field:\n"
            . '{"intent":"topic_brief|link_with_instruction|clarify","cleanTopic":"topik inti singkat atau kosong jika ada URL","instruction":"arahan gaya/sudut pandang user","suggestedOutputs":["carousel"|"video"|"poster"] atau null,"suggestedAspectRatio":"4:5"|"9:16"|"1:1"|"16:9" atau null,"suggestedSlides":3|5|7|10 atau null,"suggestedVisualProvider":"wikimedia"|"pollinations"|"procedural"|null,"suggestedSeries":"edukasi"|"fakta_cepat"|"storytelling"|"promo_brand" atau null,"assistantReply":"balasan 1-2 kalimat bahasa Indonesia menjelaskan pendekatan yang dipilih"}'
            . "\nAturan penting: Jika URL sudah diketahui, JANGAN pilih clarify — pilih link_with_instruction agar link langsung diekstrak & lanjut ke pemilihan opsi. Jika user minta dicarikan foto/gambar dari internet, isi suggestedVisualProvider=\"wikimedia\"."
            . $historyBlock . $urlsBlock
            . "\nPesan terbaru user: " . $raw;

        try {
            if ($geminiKey !== '') {
                $model = $models['gemini'] ?? env('GEMINI_TEXT_MODEL', 'gemini-2.5-flash');
                $resp = Http::timeout(12)->post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$geminiKey}",
                    [
                        'contents' => [['parts' => [['text' => $prompt]]]],
                        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2],
                    ]
                );
                if ($resp->ok()) {
                    $parsed = json_decode((string) $resp->json('candidates.0.content.parts.0.text'), true);
                    if (is_array($parsed) && !empty($parsed['intent']) && !empty($parsed['assistantReply'])) {
                        $parsed['source'] = 'gemini';
                        return $parsed;
                    }
                }
            }

            if ($opencodeKey !== '') {
                $baseUrl = rtrim((string) env('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1'), '/');
                $model = $models['opencode'] ?? env('OPENCODE_MODEL', 'glm-5.3-flash');
                $resp = Http::timeout(12)
                    ->withToken($opencodeKey)
                    ->withHeaders(['x-opencode-session' => (string) Str::uuid()])
                    ->post("{$baseUrl}/chat/completions", [
                    'model' => $model,
                    'temperature' => 0.2,
                    'messages' => [
                        ['role' => 'system', 'content' => 'Jawab hanya dengan JSON valid sesuai skema yang diminta.'],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                ]);
                if ($resp->ok()) {
                    $content = (string) $resp->json('choices.0.message.content');
                    $content = preg_replace('/^```json\s*|\s*```$/m', '', trim($content));
                    $parsed = json_decode((string) $content, true);
                    if (is_array($parsed) && !empty($parsed['intent']) && !empty($parsed['assistantReply'])) {
                        $parsed['source'] = 'opencode';
                        return $parsed;
                    }
                }
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }
}
