<?php

namespace App\Http\Controllers;

use App\Models\ProviderKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

class ProviderKeyController extends Controller
{
    public function index(): JsonResponse
    {
        $keys = ProviderKey::orderBy('provider')->get();

        return response()->json([
            'keys' => $keys,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:gemini,opencode'],
            'apiKey' => ['required', 'string', 'min:8', 'max:512'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $record = ProviderKey::firstOrNew(['provider' => $validated['provider']]);
        $record->setPlainKey($validated['apiKey']);
        $record->is_active = $validated['isActive'] ?? true;
        $record->last_test_status = null;
        $record->save();

        return response()->json([
            'key' => $record->fresh(),
            'message' => 'API key terenkripsi dan tersimpan di PostgreSQL.',
        ], 201);
    }

    public function destroy(string $provider): JsonResponse
    {
        if (!in_array($provider, ['gemini', 'opencode'], true)) {
            return response()->json(['error' => 'Provider tidak valid.'], 422);
        }

        $deleted = ProviderKey::where('provider', $provider)->delete();

        return response()->json([
            'deleted' => $deleted > 0,
            'provider' => $provider,
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:gemini,opencode'],
            'apiKey' => ['nullable', 'string', 'min:8', 'max:512'],
        ]);

        $provider = $validated['provider'];
        $stored = ProviderKey::where('provider', $provider)->first();
        $plain = !empty($validated['apiKey'])
            ? trim($validated['apiKey'])
            : ($stored?->getPlainKey());

        if (!$plain) {
            return response()->json([
                'ok' => false,
                'status' => 'missing',
                'message' => 'Belum ada API key yang diisi atau tersimpan untuk provider ini.',
            ], 422);
        }

        $ok = false;
        $status = 'error';
        $message = 'Gagal memverifikasi key.';

        try {
            if ($provider === 'gemini') {
                $res = Http::timeout(10)->get(
                    'https://generativelanguage.googleapis.com/v1beta/models',
                    ['key' => $plain]
                );
                if ($res->successful()) {
                    $ok = true;
                    $status = 'valid';
                    $message = 'Gemini API key valid dan terhubung.';
                } else {
                    $status = "http_{$res->status()}";
                    $message = 'Gemini menolak API key ini (HTTP ' . $res->status() . ').';
                }
            } else {
                $baseUrl = rtrim((string) env('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1'), '/');
                $res = Http::timeout(10)
                    ->withToken($plain)
                    ->get("{$baseUrl}/models");
                if ($res->successful()) {
                    $ok = true;
                    $status = 'valid';
                    $message = 'OpenCode API key valid dan terhubung.';
                } else {
                    $status = "http_{$res->status()}";
                    $message = 'OpenCode menolak API key ini (HTTP ' . $res->status() . ').';
                }
            }
        } catch (Throwable $e) {
            $status = 'unreachable';
            $message = 'Koneksi ke provider gagal: ' . $e->getMessage();
        }

        if ($stored && empty($validated['apiKey'])) {
            $stored->update([
                'last_tested_at' => now(),
                'last_test_status' => $status,
            ]);
        }

        return response()->json([
            'ok' => $ok,
            'status' => $status,
            'message' => $message,
        ], $ok ? 200 : 422);
    }
}
