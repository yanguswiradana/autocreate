<?php

use App\Http\Controllers\ContentJobController;
use App\Http\Controllers\SocialPublishController;
use App\Models\ContentJob;
use App\Models\SocialAccount;
use App\Models\SocialPublishLog;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('app:auto-discover-render {--count=2} {--mock}', function () {
    $count = max(1, min(5, (int) $this->option('count')));
    $mock = (bool) $this->option('mock');
    $result = ContentJobController::dispatchAutoDiscoverJobs($count, $mock, 'schedule-rss');
    if (isset($result['error'])) {
        $this->error($result['error']);
        return 1;
    }
    $this->info("Auto-Discover RSS: {$result['queuedCount']} job masuk antrean, {$result['skippedCount']} duplikat dilewati.");
    return 0;
})->purpose('Ambil topik berita RSS harian lalu antrekan render draft otomatis');

Schedule::command('app:auto-discover-render --count=2')->dailyAt('07:00');

Artisan::command('app:process-scheduled-publishes', function () {
    $due = SocialPublishLog::where('status', 'scheduled')
        ->where('scheduled_at', '<=', now())
        ->get();
    $processed = 0;
    foreach ($due as $log) {
        $job = ContentJob::find($log->content_job_id);
        $account = SocialAccount::where('platform', $log->platform)->where('is_active', true)->first();
        if (!$job || !$account) {
            $log->update(['status' => 'failed', 'error_message' => 'Job atau akun sosmed tidak ditemukan.']);
            continue;
        }
        SocialPublishController::executePublish($job, $account, $log);
        $processed++;
    }
    $this->info("Processed {$processed} scheduled social publish(es).");
    return 0;
})->purpose('Jalankan antrean publish sosmed yang sudah mencapai jadwal');

Schedule::command('app:process-scheduled-publishes')->everyFiveMinutes();
