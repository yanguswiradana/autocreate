<?php

namespace App\Jobs;

use App\Models\ContentJob;
use App\Models\ProviderKey;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Throwable;

class DispatchRenderJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 320;
    public int $tries = 2;

    public function __construct(public int $contentJobId)
    {
    }

    public function handle(): void
    {
        $job = ContentJob::find($this->contentJobId);
        if (!$job) {
            return;
        }

        $startedAt = now();
        $job->update([
            'status' => 'processing',
            'started_at' => $startedAt,
            'error_message' => null,
        ]);

        $rendererUrl = rtrim(env('RENDERER_URL', 'http://127.0.0.1:4173'), '/');
        $apiInternalUrl = rtrim(env('API_INTERNAL_URL', 'http://127.0.0.1:8000'), '/');

        $options = $job->options ?? [];
        $byokKeys = ProviderKey::activeMap();

        try {
            $response = Http::timeout(300)->post("{$rendererUrl}/api/jobs", [
                'brief' => [
                    'topic' => $job->topic,
                    'preset' => $job->preset,
                    'series' => $job->series,
                    'aspectRatio' => $job->aspect_ratio,
                    'language' => $job->language,
                    'outputs' => $job->outputs,
                    'referenceUrls' => $job->reference_urls ?? [],
                    'slides' => $options['slides'] ?? 5,
                    'mock' => $options['mock'] ?? false,
                    'visualProvider' => $options['visualProvider'] ?? 'procedural',
                    'voice' => $options['voice'] ?? null,
                    'bgm' => $options['bgm'] ?? null,
                    'bgmVolume' => $options['bgmVolume'] ?? null,
                    'customSceneImages' => $options['customSceneImages'] ?? null,
                    'apiKeys' => $byokKeys ?: null,
                ],
                'brandkit' => $options['brandkit'] ?? null,
                'webhookUrl' => "{$apiInternalUrl}/api/webhooks/render/{$job->id}",
            ]);

            if ($response->failed()) {
                throw new \RuntimeException(
                    "Renderer HTTP {$response->status()}: " . $response->body()
                );
            }

            $data = $response->json();
            $finishedAt = now();
            $folderName = $data['folderName'] ?? ($data['manifest']['folderName'] ?? null);

            // Fallback update if webhook didn't already finalize it
            $job->refresh();
            if ($job->status !== 'completed') {
                $job->update([
                    'status' => 'completed',
                    'folder_name' => $folderName ?: basename((string) ($data['jobDir'] ?? '')),
                    'manifest' => $data['manifest'] ?? null,
                    'finished_at' => $finishedAt,
                    'duration_ms' => (int) $startedAt->diffInMilliseconds($finishedAt),
                ]);
            }
        } catch (Throwable $e) {
            $finishedAt = now();
            $job->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'finished_at' => $finishedAt,
                'duration_ms' => (int) $startedAt->diffInMilliseconds($finishedAt),
            ]);
        }
    }
}
