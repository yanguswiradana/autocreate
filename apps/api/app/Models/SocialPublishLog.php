<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SocialPublishLog extends Model
{
    protected $fillable = [
        'content_job_id',
        'platform',
        'status',
        'scheduled_at',
        'remote_post_id',
        'remote_url',
        'caption',
        'error_message',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
    ];
}
