<?php

namespace App\Http\Controllers;

use App\Models\ContentJob;
use App\Models\SocialAccount;
use App\Models\SocialPublishLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

class SocialPublishController extends Controller
{
    public function indexAccounts(): JsonResponse
    {
        $accounts = SocialAccount::orderBy('platform')->get();
        return response()->json(['accounts' => $accounts]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['required', 'string', 'in:instagram,youtube,tiktok'],
            'account_name' => ['required', 'string', 'max:120'],
            'account_id' => ['nullable', 'string', 'max:160'],
            'access_token' => ['required', 'string', 'min:8', 'max:4096'],
            'refresh_token' => ['nullable', 'string', 'max:4096'],
        ]);

        $account = SocialAccount::firstOrNew(['platform' => $validated['platform']]);
        $account->account_name = trim($validated['account_name']);
        $account->account_id = !empty($validated['account_id']) ? trim($validated['account_id']) : null;
        $account->setPlainToken($validated['access_token']);
        if (array_key_exists('refresh_token', $validated)) {
            $account->setPlainRefreshToken($validated['refresh_token']);
        }
        $account->is_active = true;
        $account->last_error = null;
        $account->save();

        return response()->json(['ok' => true, 'account' => $account]);
    }

    public function destroyAccount(string $platform): JsonResponse
    {
        if (!in_array($platform, ['instagram', 'youtube', 'tiktok'], true)) {
            return response()->json(['error' => 'Platform tidak valid.'], 422);
        }
        SocialAccount::where('platform', $platform)->delete();
        return response()->json(['ok' => true]);
    }

    public function jobLogs(int $id): JsonResponse
    {
        ContentJob::findOrFail($id);
        $logs = SocialPublishLog::where('content_job_id', $id)
            ->orderByDesc('id')
            ->limit(20)
            ->get();
        return response()->json(['logs' => $logs]);
    }

    public function publishJob(Request $request, int $id): JsonResponse
    {
        $job = ContentJob::findOrFail($id);
        if ($job->status !== 'completed') {
            return response()->json(['error' => 'Project harus berstatus completed sebelum dipublish.'], 422);
        }

        $validated = $request->validate([
            'platform' => ['required', 'string', 'in:instagram,youtube,tiktok'],
            'scheduledAt' => ['nullable', 'string'],
            'caption' => ['nullable', 'string', 'max:4000'],
        ]);

        $account = SocialAccount::where('platform', $validated['platform'])
            ->where('is_active', true)
            ->first();

        if (!$account) {
            return response()->json([
                'error' => "Akun {$validated['platform']} belum terhubung. Atur dulu di Setting → Sosmed & Publish.",
            ], 422);
        }

        $caption = trim((string) ($validated['caption'] ?? ''));
        if ($caption === '') {
            $tags = is_array($job->manifest['hashtags'] ?? null)
                ? implode(' ', $job->manifest['hashtags'])
                : '';
            $caption = trim(($job->manifest['caption'] ?? $job->topic) . ($tags !== '' ? "\n\n{$tags}" : ''));
        }

        $scheduledAt = !empty($validated['scheduledAt']) ? Carbon::parse($validated['scheduledAt']) : null;
        if ($scheduledAt && $scheduledAt->isFuture()) {
            $log = SocialPublishLog::create([
                'content_job_id' => $job->id,
                'platform' => $account->platform,
                'status' => 'scheduled',
                'scheduled_at' => $scheduledAt,
                'caption' => $caption,
            ]);
            return response()->json(['ok' => true, 'log' => $log], 202);
        }

        $log = SocialPublishLog::create([
            'content_job_id' => $job->id,
            'platform' => $account->platform,
            'status' => 'queued',
            'caption' => $caption,
        ]);

        $updated = self::executePublish($job, $account, $log);
        $statusCode = $updated->status === 'published' ? 200 : 422;

        return response()->json([
            'ok' => $updated->status === 'published',
            'log' => $updated,
            'error' => $updated->error_message,
        ], $statusCode);
    }

    public static function executePublish(ContentJob $job, SocialAccount $account, SocialPublishLog $log): SocialPublishLog
    {
        $token = $account->getPlainToken();
        if (!$token) {
            $log->update([
                'status' => 'failed',
                'error_message' => 'Token akses akun tidak valid atau gagal didekripsi.',
            ]);
            return $log->fresh();
        }

        $folder = $job->folder_name ?: ($job->manifest['jobId'] ?? '');
        $publicBase = rtrim((string) env('PUBLIC_BASE_URL', ''), '/');
        $videoRel = $job->manifest['video'] ?? ($job->manifest['outputs']['video'] ?? null);
        $posterRel = $job->manifest['poster'] ?? ($job->manifest['outputs']['poster'] ?? null);
        $slides = $job->manifest['slides'] ?? ($job->manifest['outputs']['carouselSlides'] ?? []);

        try {
            if ($account->platform === 'instagram') {
                if (!$account->account_id) {
                    throw new \RuntimeException('IG Business User ID belum diisi di Setting → Sosmed & Publish.');
                }
                if ($publicBase === '') {
                    throw new \RuntimeException('PUBLIC_BASE_URL belum diatur di .env. Instagram Graph API membutuhkan URL publik HTTPS untuk mengambil file media.');
                }
                $mediaPath = $videoRel ?: ($posterRel ?: ($slides[0] ?? null));
                if (!$mediaPath) {
                    throw new \RuntimeException('Tidak ada file media (video/poster/slide) untuk dipublish ke Instagram.');
                }
                $mediaUrl = "{$publicBase}/outputs/" . rawurlencode($folder) . '/' . ltrim($mediaPath, '/');
                $isVideo = str_ends_with(strtolower($mediaPath), '.mp4');

                $createResp = Http::timeout(30)->post(
                    "https://graph.facebook.com/v21.0/{$account->account_id}/media",
                    array_filter([
                        'access_token' => $token,
                        'caption' => $log->caption,
                        'media_type' => $isVideo ? 'REELS' : null,
                        'video_url' => $isVideo ? $mediaUrl : null,
                        'image_url' => !$isVideo ? $mediaUrl : null,
                    ], fn ($v) => $v !== null)
                );
                if (!$createResp->ok()) {
                    throw new \RuntimeException('Instagram API error: ' . ($createResp->json('error.message') ?? $createResp->body()));
                }
                $creationId = $createResp->json('id');
                $pubResp = Http::timeout(30)->post(
                    "https://graph.facebook.com/v21.0/{$account->account_id}/media_publish",
                    ['creation_id' => $creationId, 'access_token' => $token]
                );
                if (!$pubResp->ok()) {
                    throw new \RuntimeException('Instagram publish error: ' . ($pubResp->json('error.message') ?? $pubResp->body()));
                }
                $postId = (string) $pubResp->json('id');
                $log->update([
                    'status' => 'published',
                    'remote_post_id' => $postId,
                    'error_message' => null,
                ]);
                return $log->fresh();
            }

            if ($account->platform === 'tiktok') {
                if ($publicBase === '') {
                    throw new \RuntimeException('PUBLIC_BASE_URL belum diatur di .env. TikTok Content Posting API membutuhkan URL publik HTTPS untuk pull video.');
                }
                if (!$videoRel) {
                    throw new \RuntimeException('TikTok membutuhkan output Video MP4.');
                }
                $videoUrl = "{$publicBase}/outputs/" . rawurlencode($folder) . '/' . ltrim($videoRel, '/');
                $resp = Http::timeout(30)
                    ->withToken($token)
                    ->post('https://open.tiktokapis.com/v2/post/publish/video/init/', [
                        'post_info' => [
                            'title' => mb_substr((string) $log->caption, 0, 150),
                            'privacy_level' => 'SELF_ONLY',
                        ],
                        'source_info' => [
                            'source' => 'PULL_FROM_URL',
                            'video_url' => $videoUrl,
                        ],
                    ]);
                if (!$resp->ok() || !empty($resp->json('error.code')) && $resp->json('error.code') !== 'ok') {
                    throw new \RuntimeException('TikTok API error: ' . ($resp->json('error.message') ?? $resp->body()));
                }
                $log->update([
                    'status' => 'published',
                    'remote_post_id' => (string) ($resp->json('data.publish_id') ?? ''),
                    'error_message' => null,
                ]);
                return $log->fresh();
            }

            // YouTube Shorts (Data API v3)
            if (!$videoRel) {
                throw new \RuntimeException('YouTube Shorts membutuhkan output Video MP4.');
            }
            $rendererUrl = rtrim(env('RENDERER_URL', 'http://127.0.0.1:4173'), '/');
            $videoBin = Http::timeout(60)->get("{$rendererUrl}/outputs/" . rawurlencode($folder) . '/' . ltrim($videoRel, '/'));
            if (!$videoBin->ok()) {
                throw new \RuntimeException('Gagal mengambil file video.mp4 dari renderer.');
            }
            $initResp = Http::timeout(30)
                ->withToken($token)
                ->withHeaders([
                    'X-Upload-Content-Type' => 'video/mp4',
                    'X-Upload-Content-Length' => (string) strlen($videoBin->body()),
                ])
                ->post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', [
                    'snippet' => [
                        'title' => mb_substr($job->topic, 0, 95),
                        'description' => (string) $log->caption,
                        'categoryId' => '22',
                    ],
                    'status' => ['privacyStatus' => 'private'],
                ]);
            $uploadUrl = $initResp->header('Location');
            if (!$initResp->ok() || !$uploadUrl) {
                throw new \RuntimeException('YouTube API init error: ' . ($initResp->json('error.message') ?? $initResp->body()));
            }
            $putResp = Http::timeout(120)
                ->withBody($videoBin->body(), 'video/mp4')
                ->put($uploadUrl);
            if (!$putResp->ok()) {
                throw new \RuntimeException('YouTube upload error: ' . $putResp->body());
            }
            $vidId = (string) $putResp->json('id');
            $log->update([
                'status' => 'published',
                'remote_post_id' => $vidId,
                'remote_url' => $vidId !== '' ? "https://youtube.com/shorts/{$vidId}" : null,
                'error_message' => null,
            ]);
            return $log->fresh();
        } catch (\Throwable $e) {
            $account->update(['last_error' => $e->getMessage()]);
            $log->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);
            return $log->fresh();
        }
    }
}
