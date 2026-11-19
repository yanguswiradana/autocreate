<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class SocialAccount extends Model
{
    protected $fillable = [
        'platform',
        'account_name',
        'account_id',
        'encrypted_token',
        'masked_token',
        'encrypted_refresh_token',
        'is_active',
        'last_error',
    ];

    protected $hidden = [
        'encrypted_token',
        'encrypted_refresh_token',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function setPlainToken(string $plain): void
    {
        $clean = trim($plain);
        $this->encrypted_token = Crypt::encryptString($clean);
        $this->masked_token = ProviderKey::maskKey($clean);
    }

    public function getPlainToken(): ?string
    {
        if (!$this->encrypted_token) {
            return null;
        }
        try {
            return Crypt::decryptString($this->encrypted_token);
        } catch (Throwable) {
            return null;
        }
    }

    public function setPlainRefreshToken(?string $plain): void
    {
        $clean = trim((string) $plain);
        $this->encrypted_refresh_token = $clean !== '' ? Crypt::encryptString($clean) : null;
    }
}
