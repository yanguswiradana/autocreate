<?php

namespace App\Jobs;

use App\Models\VideoEdit;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Throwable;

class ProcessVideoEditJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;
    public int $tries = 1;

    public function __construct(public int $videoEditId)
    {
    }

    public function handle(): void
    {
        $edit = VideoEdit::find($this->videoEditId);
        if (!$edit) {
            return;
        }

        $startedAt = now();
        $edit->update([
            'status' => 'processing',
            'error_message' => null,
        ]);

        $videoAiUrl = rtrim((string) env('VIDEO_AI_URL', 'http://video-ai:8090'), '/');
        $mediaRoot = rtrim((string) env('SHARED_MEDIA_DIR', '/app/shared_media'), '/');

        $inputFullPath = "{$mediaRoot}/" . ltrim($edit->input_path, '/');
        $outputRelPath = "processed/edit_{$edit->id}.mp4";
        $outputFullPath = "{$mediaRoot}/{$outputRelPath}";

        try {
            $res = Http::timeout(580)->post("{$videoAiUrl}/process", [
                'inputPath' => $inputFullPath,
                'outputPath' => $outputFullPath,
                'options' => $edit->options ?? [],
            ]);

            if ($res->failed()) {
                throw new \RuntimeException(
                    "Video AI HTTP {$res->status()}: " . $res->body()
                );
            }

            $data = $res->json();
            $edit->update([
                'status' => 'completed',
                'output_path' => $outputRelPath,
                'transcript' => $data['transcript'] ?? null,
                'duration_ms' => (int) $startedAt->diffInMilliseconds(now()),
            ]);
        } catch (Throwable $e) {
            $edit->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'duration_ms' => (int) $startedAt->diffInMilliseconds(now()),
            ]);
        }
    }
}
