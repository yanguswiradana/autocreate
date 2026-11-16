<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('topic')->default('');
            $table->string('preset')->default('noir_editorial');
            $table->string('series')->nullable();
            $table->string('aspect_ratio')->default('4:5');
            $table->string('language')->default('id');
            $table->json('outputs');
            $table->json('reference_urls')->nullable();
            $table->json('options')->nullable();
            $table->string('status')->default('queued')->index();
            $table->string('source')->default('web');
            $table->string('batch_id')->nullable()->index();
            $table->string('folder_name')->nullable()->index();
            $table->json('manifest')->nullable();
            $table->json('blueprint')->nullable();
            $table->text('error_message')->nullable();
            $table->integer('duration_ms')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_jobs');
    }
};
