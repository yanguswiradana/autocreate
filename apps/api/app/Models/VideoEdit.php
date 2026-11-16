<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoEdit extends Model
{
    protected $fillable = [
        'title',
        'input_path',
        'output_path',
        'status',
        'options',
        'transcript',
        'error_message',
        'duration_ms',
    ];

    protected $casts = [
        'options' => 'array',
    ];
}
