<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brandkits', function (Blueprint $table) {
            $table->id();
            $table->boolean('enabled')->default(false);
            $table->string('brand_name', 120)->nullable();
            $table->string('handle', 120)->nullable();
            $table->string('tagline', 200)->nullable();
            $table->string('primary_color', 20)->default('#ddf77b');
            $table->string('secondary_color', 20)->default('#181824');
            $table->string('accent_color', 20)->default('#f4f4f5');
            $table->string('font_family', 80)->default('Plus Jakarta Sans');
            $table->longText('logo_data_url')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('brandkits');
    }
};
