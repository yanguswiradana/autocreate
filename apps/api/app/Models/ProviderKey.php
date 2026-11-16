<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class ProviderKey extends Model
{
    protected $fillable = [
        'provider',
        'encrypted_key',
        'masked_key',
        'model',
        'is_active',
        'last_tested_at',
        'last_test_status',
    ];

    protected $hidden = [
        'encrypted_key',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'last_tested_at' => 'datetime',
    ];

    public static function maskKey(string $plain): string
    {
        $trimmed = trim($plain);
        $len = strlen($trimmed);
        if ($len <= 8) {
            return str_repeat('•', max(4, $len));
        }

        return substr($trimmed, 0, 4) . str_repeat('•', 8) . substr($trimmed, -4);
    }

    public function setPlainKey(string $plain): void
    {
        $clean = trim($plain);
        $this->encrypted_key = Crypt::encryptString($clean);
        $this->masked_key = self::maskKey($clean);
    }

    public function getPlainKey(): ?string
    {
        if (!$this->encrypted_key) {
            return null;
        }

        try {
            return Crypt::decryptString($this->encrypted_key);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Decrypts active BYOK keys into an associative array for worker dispatch.
     *
     * @return array<string, string>
     */
    public static function activeMap(): array
    {
        $map = [];
        $rows = self::where('is_active', true)->get();
        foreach ($rows as $row) {
            $plain = $row->getPlainKey();
            if ($plain) {
                $map[$row->provider] = $plain;
            }
        }

        return $map;
    }

    /**
     * Returns configured model overrides per active provider.
     *
     * @return array<string, string>
     */
    public static function activeModels(): array
    {
        $map = [];
        $rows = self::where('is_active', true)->whereNotNull('model')->get();
        foreach ($rows as $row) {
            $model = trim((string) $row->model);
            if ($model !== '') {
                $map[$row->provider] = $model;
            }
        }

        return $map;
    }
}
