<?php

namespace App\Http\Controllers;

use App\Models\Brandkit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BrandkitController extends Controller
{
    public function show(): JsonResponse
    {
        $brandkit = Brandkit::query()->first();

        return response()->json([
            'brandkit' => $brandkit ? $brandkit->toApiArray() : Brandkit::defaults(),
            'persisted' => $brandkit !== null,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'brandName' => ['nullable', 'string', 'max:120'],
            'handle' => ['nullable', 'string', 'max:120'],
            'tagline' => ['nullable', 'string', 'max:200'],
            'primaryColor' => ['nullable', 'string', 'max:20'],
            'secondaryColor' => ['nullable', 'string', 'max:20'],
            'accentColor' => ['nullable', 'string', 'max:20'],
            'fontFamily' => ['nullable', 'string', 'max:80'],
            'logoDataUrl' => ['nullable', 'string', 'max:2000000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $brandkit = Brandkit::query()->first() ?? new Brandkit();
        $brandkit->fill([
            'enabled' => (bool) $validated['enabled'],
            'brand_name' => $validated['brandName'] ?? '',
            'handle' => $validated['handle'] ?? '',
            'tagline' => $validated['tagline'] ?? '',
            'primary_color' => ($validated['primaryColor'] ?? '') ?: '#ddf77b',
            'secondary_color' => ($validated['secondaryColor'] ?? '') ?: '#181824',
            'accent_color' => ($validated['accentColor'] ?? '') ?: '#f4f4f5',
            'font_family' => ($validated['fontFamily'] ?? '') ?: 'Plus Jakarta Sans',
            'logo_data_url' => $validated['logoDataUrl'] ?? null,
            'notes' => $validated['notes'] ?? '',
        ]);
        $brandkit->save();

        return response()->json([
            'ok' => true,
            'brandkit' => $brandkit->toApiArray(),
            'persisted' => true,
        ]);
    }

    public function destroy(): JsonResponse
    {
        Brandkit::query()->delete();

        return response()->json([
            'ok' => true,
            'brandkit' => Brandkit::defaults(),
            'persisted' => false,
        ]);
    }
}
