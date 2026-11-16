<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Brandkit extends Model
{
    protected $fillable = [
        'enabled',
        'brand_name',
        'handle',
        'tagline',
        'primary_color',
        'secondary_color',
        'accent_color',
        'font_family',
        'logo_data_url',
        'notes',
    ];

    protected $casts = [
        'enabled' => 'boolean',
    ];

    public static function defaults(): array
    {
        return [
            'enabled' => false,
            'brandName' => '',
            'handle' => '',
            'tagline' => '',
            'primaryColor' => '#ddf77b',
            'secondaryColor' => '#181824',
            'accentColor' => '#f4f4f5',
            'fontFamily' => 'Plus Jakarta Sans',
            'logoDataUrl' => null,
            'notes' => '',
        ];
    }

    public function toApiArray(): array
    {
        return [
            'enabled' => (bool) $this->enabled,
            'brandName' => (string) ($this->brand_name ?? ''),
            'handle' => (string) ($this->handle ?? ''),
            'tagline' => (string) ($this->tagline ?? ''),
            'primaryColor' => (string) ($this->primary_color ?: '#ddf77b'),
            'secondaryColor' => (string) ($this->secondary_color ?: '#181824'),
            'accentColor' => (string) ($this->accent_color ?: '#f4f4f5'),
            'fontFamily' => (string) ($this->font_family ?: 'Plus Jakarta Sans'),
            'logoDataUrl' => $this->logo_data_url,
            'notes' => (string) ($this->notes ?? ''),
        ];
    }
}
