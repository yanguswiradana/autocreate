<?php

use App\Http\Controllers\ContentJobController;
use App\Http\Controllers\ProviderKeyController;
use App\Http\Controllers\VideoEditController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [ContentJobController::class, 'health']);

Route::get('/jobs', [ContentJobController::class, 'index']);
Route::post('/jobs', [ContentJobController::class, 'store']);
Route::get('/jobs/{id}', [ContentJobController::class, 'show']);
Route::delete('/jobs/{id}', [ContentJobController::class, 'destroy']);
Route::post('/jobs/{id}/rerender', [ContentJobController::class, 'rerender']);

Route::post('/batches', [ContentJobController::class, 'batch']);
Route::get('/batches/{batchId}', [ContentJobController::class, 'batchStatus']);

Route::post('/webhooks/render/{id}', [ContentJobController::class, 'webhook']);
Route::post('/extract-urls', [ContentJobController::class, 'extractUrls']);
Route::post('/discover', [ContentJobController::class, 'discover']);

Route::get('/provider-keys', [ProviderKeyController::class, 'index']);
Route::post('/provider-keys', [ProviderKeyController::class, 'store']);
Route::post('/provider-keys/test', [ProviderKeyController::class, 'test']);
Route::delete('/provider-keys/{provider}', [ProviderKeyController::class, 'destroy']);

Route::get('/video-edits', [VideoEditController::class, 'index']);
Route::post('/video-edits', [VideoEditController::class, 'store']);
Route::get('/video-edits/{id}', [VideoEditController::class, 'show']);
Route::get('/video-edits/{id}/download', [VideoEditController::class, 'download']);
Route::delete('/video-edits/{id}', [VideoEditController::class, 'destroy']);
