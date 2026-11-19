<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('platform', 32)->unique(); // instagram, youtube, tiktok
            $table->string('account_name', 120);
            $table->string('account_id', 160)->nullable();
            $table->text('encrypted_token');
            $table->string('masked_token', 64);
            $table->text('encrypted_refresh_token')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::create('social_publish_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('content_job_id')->index();
            $table->string('platform', 32);
            $table->string('status', 32)->default('queued'); // queued, scheduled, published, failed
            $table->timestamp('scheduled_at')->nullable();
            $table->string('remote_post_id', 160)->nullable();
            $table->string('remote_url', 500)->nullable();
            $table->text('caption')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_publish_logs');
        Schema::dropIfExists('social_accounts');
    }
};
