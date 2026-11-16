<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_edits', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('input_path');
            $table->string('output_path')->nullable();
            $table->string('status', 32)->default('queued')->index();
            $table->json('options')->nullable();
            $table->text('transcript')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_edits');
    }
};
