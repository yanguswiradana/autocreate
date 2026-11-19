<?php

use App\Http\Controllers\ContentJobController;
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
