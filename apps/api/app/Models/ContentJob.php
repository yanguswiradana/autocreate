<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentJob extends Model
{
    protected $fillable = [
        'topic',
        'preset',
        'series',
        'aspect_ratio',
        'language',
        'outputs',
        'reference_urls',
        'options',
        'status',
        'source',
        'batch_id',
        'folder_name',
        'manifest',
        'blueprint',
        'error_message',
        'duration_ms',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'outputs' => 'array',
        'reference_urls' => 'array',
        'options' => 'array',
        'manifest' => 'array',
        'blueprint' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];
}
