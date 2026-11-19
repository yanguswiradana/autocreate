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

    public function storage(): JsonResponse
    {
        $res = Http::timeout(10)->get("{$this->rendererUrl()}/api/storage-stats");
        if (!$res->ok()) {
            return response()->json(['error' => 'Gagal membaca info storage renderer.'], 502);
        }
        $data = $res->json();
        $activeFolders = ContentJob::whereNotNull('folder_name')->pluck('folder_name')->all();
        $activeSet = array_flip($activeFolders);
        $folders = $data['folders'] ?? [];
        $orphans = array_values(array_filter($folders, fn ($f) => !isset($activeSet[$f['name'] ?? ''])));
        $orphanBytes = array_sum(array_map(fn ($f) => (int) ($f['bytes'] ?? 0), $orphans));

        return response()->json([
            'totalBytes' => (int) ($data['totalBytes'] ?? 0),
            'folderCount' => (int) ($data['folderCount'] ?? 0),
            'orphanCount' => count($orphans),
            'orphanBytes' => $orphanBytes,
        ]);
    }

    public function storageCleanup(): JsonResponse
    {
        $keepFolders = ContentJob::whereNotNull('folder_name')->pluck('folder_name')->values()->all();
        $res = Http::timeout(30)->post("{$this->rendererUrl()}/api/storage-cleanup", [
            'keepFolders' => $keepFolders,
        ]);
        if (!$res->ok()) {
            return response()->json(['error' => 'Gagal membersihkan folder orphan di renderer.'], 502);
        }
        return response()->json($res->json());
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
            'series' => ['nullable', 'string', 'in:edukasi,fakta_cepat,storytelling,promo_brand,komparasi,kronologi,checklist,opini_quote'],
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

    public function runAutoDiscover(Request $request): JsonResponse
    {
        $count = max(1, min(5, (int) $request->input('count', 2)));
        $mock = $request->boolean('mock', false);
        $result = self::dispatchAutoDiscoverJobs($count, $mock, 'auto-rss');

        if (isset($result['error'])) {
            return response()->json(['error' => $result['error']], 502);
        }
        return response()->json($result, 202);
    }

    public static function dispatchAutoDiscoverJobs(int $count = 2, bool $mock = false, string $source = 'auto-rss'): array
    {
        $rendererUrl = rtrim(env('RENDERER_URL', 'http://127.0.0.1:4173'), '/');
        $res = Http::timeout(30)->post("{$rendererUrl}/api/discover", [
            'count' => $count,
            'mock' => $mock,
        ]);
        if (!$res->ok()) {
            return ['error' => 'Gagal mengambil RSS dari renderer.'];
        }

        $topics = $res->json('topics') ?? [];
        $queued = [];
        $skipped = 0;

        foreach ($topics as $item) {
            $topic = trim((string) ($item['topic'] ?? ''));
            if ($topic === '') continue;

            $existsRecent = ContentJob::where('topic', $topic)
                ->where('created_at', '>=', now()->subDay())
                ->exists();
            if ($existsRecent) {
                $skipped++;
                continue;
            }

            $preset = (string) ($item['preset'] ?? 'noir_editorial');
            $validPresets = ['noir_editorial', 'midnight_tech', 'monochrome_luxury', 'warm_cinematic', 'neon_cyber', 'clean_paper'];
            if (!in_array($preset, $validPresets, true)) {
                $preset = 'noir_editorial';
            }

            $link = !empty($item['link']) ? [(string) $item['link']] : [];
            $job = ContentJob::create([
                'topic' => $topic,
                'preset' => $preset,
                'series' => 'fakta_cepat',
                'aspect_ratio' => '4:5',
                'language' => 'id',
                'outputs' => ['carousel', 'poster'],
                'reference_urls' => $link,
                'options' => [
                    'slides' => 5,
                    'mock' => $mock,
                    'visualProvider' => 'wikimedia',
                ],
                'status' => 'queued',
                'source' => $source,
            ]);
            DispatchRenderJob::dispatch($job->id);
            $queued[] = $job;
        }

        return [
            'ok' => true,
            'queuedCount' => count($queued),
            'skippedCount' => $skipped,
            'jobs' => $queued,
        ];
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
            'step' => ['sometimes', 'string', 'max:32'],
        ]);

        $raw = trim($validated['message']);
        $mock = (bool) ($validated['mock'] ?? false);
        $step = (string) ($validated['step'] ?? 'idle');
        preg_match_all('/https?:\/\/[^\s]+/i', $raw, $urlMatches);
        $msgUrls = array_values(array_unique(array_map(
            fn (string $u) => rtrim($u, ".,;:!?)\]}\"'\n\r"),
            $urlMatches[0] ?? []
        )));
        $knownUrls = array_values(array_filter(array_map('strval', $validated['knownUrls'] ?? [])));
        $urls = array_values(array_unique(array_merge($knownUrls, $msgUrls)));
        $history = $validated['history'] ?? [];
        $textOnly = trim((string) preg_replace('/https?:\/\/[^\s]+/i', '', $raw));

        $heuristic = $this->heuristicIntent($raw, $textOnly, $urls, $step);

        if ($mock) {
            return response()->json($heuristic);
        }

        $aiResult = $this->classifyIntentWithAi($raw, $urls, $history, $step);
        if ($aiResult !== null) {
            // Merge non-null AI fields over heuristic baseline so regex-detected options aren't wiped by null AI fields
            $merged = $heuristic;
            foreach ($aiResult as $k => $v) {
                if ($v !== null && $v !== '' && $v !== []) {
                    $merged[$k] = $v;
                }
            }
            $merged['urls'] = $urls;
            $merged['source'] = $aiResult['source'] ?? 'ai';
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

    private function heuristicIntent(string $raw, string $textOnly, array $urls, string $step = 'idle'): array
    {
        $lower = mb_strtolower($raw);
        $inConfigStep = in_array($step, ['awaiting_config', 'awaiting_confirm'], true);

        // Quick execute command in awaiting_config / awaiting_confirm
        if ($inConfigStep && preg_match('/^(gas(\s+generate)?|lanjut(kan)?|mulai|eksekusi|generate(\s+sekarang)?|oke(\s+(gas|lanjut|buat))?|buat\s+sekarang|siap\s+generate)\b[!.\s]*$/i', $lower)) {
            return [
                'intent' => 'action_generate',
                'action' => 'generate',
                'urls' => $urls,
                'cleanTopic' => '',
                'instruction' => '',
                'suggestedOutputs' => null,
                'suggestedAspectRatio' => null,
                'suggestedVisualProvider' => null,
                'suggestedSlides' => null,
                'suggestedSeries' => null,
                'suggestedPreset' => null,
                'suggestedLanguage' => null,
                'assistantReply' => 'Siap! Konfigurasi sudah oke, saya langsung mulai proses generate konten sekarang.',
                'source' => 'heuristic',
            ];
        }

        $outputs = $this->detectOutputs($lower);
        $aspectRatio = $this->detectAspectRatio($lower, $outputs);
        $slides = $this->detectSlides($lower);
        $visualProvider = $this->detectVisualProvider($lower);
        $series = $this->detectSeries($lower);
        $preset = $this->detectPreset($lower);
        $language = $this->detectLanguage($lower);

        $hasAnyOptionChange = $outputs !== null || $aspectRatio !== null || $slides !== null
            || $visualProvider !== null || $series !== null || $preset !== null || $language !== null;

        if ($inConfigStep) {
            return [
                'intent' => 'update_config',
                'action' => 'update_config',
                'urls' => $urls,
                'cleanTopic' => '',
                'instruction' => $hasAnyOptionChange ? '' : $textOnly,
                'suggestedOutputs' => $outputs,
                'suggestedAspectRatio' => $aspectRatio,
                'suggestedVisualProvider' => $visualProvider,
                'suggestedSlides' => $slides,
                'suggestedSeries' => $series,
                'suggestedPreset' => $preset,
                'suggestedLanguage' => $language,
                'assistantReply' => $this->buildOptionSummaryReply(
                    'Pengaturan diperbarui',
                    $outputs,
                    $aspectRatio,
                    $slides,
                    $visualProvider,
                    $series,
                    $preset,
                    $language,
                    $hasAnyOptionChange ? 'Silakan cek ringkasan lalu klik Gas Generate Sekarang.' : 'Arahan tambahan sudah dicatat ke brief. Klik Gas Generate Sekarang jika sudah siap.'
                ),
                'source' => 'heuristic',
            ];
        }

        if (count($urls) > 0) {
            $cleanInstr = trim((string) preg_replace('/^(halo|hai|hi)?[,\s]*(aku mau |saya ingin |tolong |coba )?(bikin|buat|buatkan|membuat|olah)\s+(konten\s+)?(feed|carousel|video|reels|poster)?\s*(dari\s+)?(berita|link|artikel)?\s*(ini)?/i', '', $textOnly));
            $slugTopic = $this->slugTopicFromUrl($urls[0]);
            return [
                'intent' => 'link_with_instruction',
                'action' => 'none',
                'urls' => $urls,
                'cleanTopic' => $slugTopic,
                'instruction' => $cleanInstr ?: $textOnly,
                'suggestedOutputs' => $outputs,
                'suggestedAspectRatio' => $aspectRatio,
                'suggestedVisualProvider' => $visualProvider,
                'suggestedSlides' => $slides,
                'suggestedSeries' => $series,
                'suggestedPreset' => $preset,
                'suggestedLanguage' => $language,
                'assistantReply' => $this->buildOptionSummaryReply(
                    'Oke, link referensi sudah tersimpan dan saya proses',
                    $outputs,
                    $aspectRatio,
                    $slides,
                    $visualProvider,
                    $series,
                    $preset,
                    $language,
                    'Saya ekstrak isi beritanya dulu ya.'
                ),
                'source' => 'heuristic',
            ];
        }

        // Pure greeting / capability / how-to question WITHOUT a content creation intent
        $hasCreationVerb = preg_match('/\b(bikin|buat|buatkan|membuat|generate|olah|jadikan|tulis|susun|rangkum)\b/i', $lower) === 1;
        $isPureGreeting = preg_match('/^(halo|hai|hi|hello|hey|p|tes|test|selamat\s+(pagi|siang|sore|malam))[\s!?.]*$/i', $lower) === 1;
        $isCapabilityQuestion = !$hasCreationVerb && !$hasAnyOptionChange && (
            str_contains($raw, '?')
            || preg_match('/^(cara|bagaimana|gimana|apa itu|kenapa|kamu bisa apa|fiturnya apa|bisa bantu apa)/i', $lower) === 1
        ) && mb_strlen($raw) < 140;

        if ($isPureGreeting || $isCapabilityQuestion) {
            return [
                'intent' => 'clarify',
                'action' => 'none',
                'urls' => [],
                'cleanTopic' => '',
                'instruction' => '',
                'suggestedOutputs' => null,
                'suggestedAspectRatio' => null,
                'suggestedVisualProvider' => null,
                'suggestedSlides' => null,
                'suggestedSeries' => null,
                'suggestedPreset' => null,
                'suggestedLanguage' => null,
                'assistantReply' => $isPureGreeting
                    ? 'Halo! Saya Asisten Studio. Tulis topik konten (misal: "buatkan carousel 5 slide tentang kopi"), tempel link berita, atau klik @Remix untuk mengolah proyek lama.'
                    : 'Saya bisa bantu membuat konten Carousel, Video Reels/TikTok, atau Poster otomatis dari topik maupun link berita. Cukup kirim topik atau tempel URL + format yang diinginkan ya!',
                'source' => 'heuristic',
            ];
        }

        $cleaned = trim((string) preg_replace('/^(halo|hai|hi)?[,\s]*(aku mau |saya ingin |tolong |coba )?(bikin|buat|buatkan|membuat)\s+(konten\s+)?(feed|carousel|video|reels|tiktok|shorts|poster|infografis)?\s*(\d+\s*slide\s*)?(tentang\s+|soal\s+|mengenai\s+)?/i', '', $textOnly));
        $finalTopic = $cleaned !== '' ? $cleaned : $textOnly;
        return [
            'intent' => 'topic_brief',
            'action' => 'none',
            'urls' => [],
            'cleanTopic' => $finalTopic,
            'instruction' => '',
            'suggestedOutputs' => $outputs,
            'suggestedAspectRatio' => $aspectRatio,
            'suggestedVisualProvider' => $visualProvider,
            'suggestedSlides' => $slides,
            'suggestedSeries' => $series,
            'suggestedPreset' => $preset,
            'suggestedLanguage' => $language,
            'assistantReply' => $this->buildOptionSummaryReply(
                'Siap, saya arahkan ke brief topik "' . $finalTopic . '"',
                $outputs,
                $aspectRatio,
                $slides,
                $visualProvider,
                $series,
                $preset,
                $language,
                'Silakan cek atau lengkapi opsi detail di bawah.'
            ),
            'source' => 'heuristic',
        ];
    }

    private function detectOutputs(string $lower): ?array
    {
        if (preg_match('/\b(semua format|paket lengkap|all format|semuanya)\b/i', $lower)) {
            return ['carousel', 'video', 'poster'];
        }
        $outputs = [];
        if (preg_match('/\b(feed|carousel|karosel|slide|ig|instagram)\b/i', $lower)) {
            $outputs[] = 'carousel';
        }
        if (preg_match('/\b(reels|tiktok|shorts|video|animasi)\b/i', $lower)) {
            $outputs[] = 'video';
        }
        if (preg_match('/\b(poster|flyer|infografis|pamflet|banner|spanduk)\b/i', $lower)) {
            $outputs[] = 'poster';
        }
        if (preg_match('/\b(raw image|foto mentah)\b/i', $lower)) {
            $outputs[] = 'raw';
        }
        return count($outputs) > 0 ? array_values(array_unique($outputs)) : null;
    }

    private function detectAspectRatio(string $lower, ?array $outputs): ?string
    {
        if (preg_match('/\b9\s*[:x]\s*16\b|\b(vertical|vertikal|story|stories)\b/i', $lower)) {
            return '9:16';
        }
        if (preg_match('/\b16\s*[:x]\s*9\b|\b(landscape|horizontal|youtube)\b/i', $lower)) {
            return '16:9';
        }
        if (preg_match('/\b1\s*[:x]\s*1\b|\b(square|kotak|persegi)\b/i', $lower)) {
            return '1:1';
        }
        if (preg_match('/\b4\s*[:x]\s*5\b|\bportrait\b/i', $lower)) {
            return '4:5';
        }
        if ($outputs !== null) {
            if ($outputs === ['video']) {
                return '9:16';
            }
            if (in_array('carousel', $outputs, true) || in_array('poster', $outputs, true)) {
                return '4:5';
            }
        }
        return null;
    }

    private function detectSlides(string $lower): ?int
    {
        $wordMap = ['tiga' => 3, 'empat' => 4, 'lima' => 5, 'enam' => 6, 'tujuh' => 7, 'delapan' => 8, 'sembilan' => 9, 'sepuluh' => 10];
        $num = null;
        if (preg_match('/\b(\d{1,2})\s*(?:slide|halaman|hal|kartu|card|bagian)\b/i', $lower, $m)) {
            $num = (int) $m[1];
        } elseif (preg_match('/\b(tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s*(?:slide|halaman|kartu|bagian)\b/i', $lower, $m)) {
            $num = $wordMap[mb_strtolower($m[1])] ?? null;
        } elseif (preg_match('/\b(singkat|ringkas|pendek)\b/i', $lower)) {
            $num = 3;
        } elseif (preg_match('/\b(mendalam|lengkap|detail)\b/i', $lower)) {
            $num = 10;
        }
        if ($num === null) {
            return null;
        }
        if ($num <= 3) return 3;
        if ($num <= 5) return 5;
        if ($num <= 8) return 7;
        return 10;
    }

    private function detectVisualProvider(string $lower): ?string
    {
        if (preg_match('/\b(gemini|imagen)\b/i', $lower)) {
            return 'gemini';
        }
        if (preg_match('/\b(pollinations|ilustrasi ai|gambar ai|generate gambar|ai image|kartun|anime|3d)\b/i', $lower)) {
            return 'pollinations';
        }
        if (preg_match('/(tanpa foto|tanpa gambar|teks saja|polos|tipografi|procedural)/i', $lower)) {
            return 'procedural';
        }
        if (preg_match('/(wikimedia|foto asli|foto nyata|foto berita|cari(?:kan)?\s+(?:foto|gambar)|dari internet|pakai foto|fotony[ae]|background|backgroud|latar)/i', $lower)) {
            return 'wikimedia';
        }
        return null;
    }

    private function detectSeries(string $lower): ?string
    {
        if (preg_match('/\b(komparasi|perbandingan|mitos\s+vs\s+fakta|sebelum\s+vs\s+sesudah|bandingkan)\b/i', $lower)) return 'komparasi';
        if (preg_match('/\b(kronologi|timeline|sejarah|tahapan|perkembangan)\b/i', $lower)) return 'kronologi';
        if (preg_match('/\b(checklist|ceklist|daftar\s+cek|syarat|persiapan)\b/i', $lower)) return 'checklist';
        if (preg_match('/\b(opini|quote|kutipan|pendapat|sudut\s+pandang)\b/i', $lower)) return 'opini_quote';
        if (preg_match('/\b(edukasi|tips|tutorial|cara|langkah|panduan)\b/i', $lower)) return 'edukasi';
        if (preg_match('/\b(fakta|berita|news|headline|breaking|terkini|isu)\b/i', $lower)) return 'fakta_cepat';
        if (preg_match('/\b(storytelling|cerita|kisah|reflektif|pengalaman)\b/i', $lower)) return 'storytelling';
        if (preg_match('/\b(promo|jualan|diskon|produk|brand|penawaran)\b/i', $lower)) return 'promo_brand';
        return null;
    }

    private function detectPreset(string $lower): ?string
    {
        if (preg_match('/\b(noir|editorial)\b/i', $lower)) return 'noir_editorial';
        if (preg_match('/\b(midnight|tech|futuristik)\b/i', $lower)) return 'midnight_tech';
        if (preg_match('/\b(monochrome|monokrom|luxury|mewah)\b/i', $lower)) return 'monochrome_luxury';
        if (preg_match('/\b(warm|cinematic|hangat)\b/i', $lower)) return 'warm_cinematic';
        if (preg_match('/\b(neon|cyber)\b/i', $lower)) return 'neon_cyber';
        if (preg_match('/\b(clean|paper|putih|terang|cerah|majalah)\b/i', $lower)) return 'clean_paper';
        return null;
    }

    private function detectLanguage(string $lower): ?string
    {
        if (preg_match('/\b(bahasa inggris|in english|english|b\.?\s*inggris)\b/i', $lower)) return 'en';
        if (preg_match('/\b(bahasa indonesia|in indonesian|b\.?\s*indo)\b/i', $lower)) return 'id';
        return null;
    }

    private function buildOptionSummaryReply(
        string $prefix,
        ?array $outputs,
        ?string $aspectRatio,
        ?int $slides,
        ?string $visualProvider,
        ?string $series,
        ?string $preset,
        ?string $language,
        string $suffix
    ): string {
        $parts = [];
        if ($outputs) $parts[] = 'format ' . implode(' + ', $outputs);
        if ($aspectRatio) $parts[] = "rasio {$aspectRatio}";
        if ($slides) $parts[] = "{$slides} slide";
        if ($series) $parts[] = "gaya {$series}";
        if ($preset) $parts[] = "tema {$preset}";
        if ($visualProvider) $parts[] = "visual {$visualProvider}";
        if ($language) $parts[] = "bahasa " . strtoupper($language);
        $detail = count($parts) > 0 ? ' (' . implode(', ', $parts) . ')' : '';
        return "{$prefix}{$detail}. {$suffix}";
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

    private function classifyIntentWithAi(string $raw, array $urls, array $history = [], string $step = 'idle'): ?array
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

        $prompt = "Analisis pesan user untuk studio pembuat konten sosmed (step saat ini: {$step}). Kembalikan JSON valid dengan field:\n"
            . '{"intent":"topic_brief|link_with_instruction|clarify|update_config|action_generate","action":"none|update_config|generate","cleanTopic":"topik inti singkat atau kosong jika ada URL/update_config","instruction":"arahan gaya/sudut pandang user","suggestedOutputs":["carousel"|"video"|"poster"|"raw"] atau null,"suggestedAspectRatio":"4:5"|"9:16"|"1:1"|"16:9" atau null,"suggestedSlides":3|5|7|10 atau null,"suggestedVisualProvider":"wikimedia"|"pollinations"|"gemini"|"procedural"|null,"suggestedSeries":"edukasi"|"fakta_cepat"|"storytelling"|"promo_brand"|"komparasi"|"kronologi"|"checklist"|"opini_quote"|null,"suggestedPreset":"noir_editorial"|"midnight_tech"|"monochrome_luxury"|"warm_cinematic"|"neon_cyber"|"clean_paper"|null,"suggestedLanguage":"id"|"en"|null,"assistantReply":"balasan 1-2 kalimat bahasa Indonesia yang natural, akurat, dan menyebut opsi yang dipilih"}'
            . "\nAturan penting:"
            . "\n1. Jika URL sudah diketahui, JANGAN pilih clarify — pilih link_with_instruction agar link langsung diproses."
            . "\n2. Jika step adalah awaiting_config atau awaiting_confirm:"
            . "\n   - Jika user bilang 'gas', 'lanjut', 'mulai', 'buat sekarang', 'eksekusi', set intent='action_generate' dan action='generate'."
            . "\n   - Jika user mengubah opsi (format, slide, rasio, gaya, tema, visual, bahasa) atau menambah arahan, set intent='update_config' dan action='update_config'."
            . "\n3. Jika user minta dicarikan foto/gambar asli/dari internet, isi suggestedVisualProvider='wikimedia'. Jika minta ilustrasi/gambar AI, isi 'pollinations'. Jika minta tanpa foto/teks saja, isi 'procedural'."
            . "\n4. Jika user minta lebih dari satu format (misal carousel dan video), masukkan keduanya ke suggestedOutputs."
            . "\n5. Jika pesan hanya sapaan murni atau pertanyaan cara kerja aplikasi tanpa topik/URL, pilih clarify dan jelaskan singkat cara pakainya."
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
