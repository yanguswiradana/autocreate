<?php

namespace App\Http\Controllers;

use App\Jobs\DispatchRenderJob;
use App\Models\ContentJob;
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
}
