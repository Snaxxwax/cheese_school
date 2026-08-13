package com.cheeseschool.game

import kotlin.math.hypot

data class Vec2(var x: Float, var y: Float) {
    fun distanceTo(other: Vec2): Float = hypot(x - other.x, y - other.y)
    fun copyValue(): Vec2 = Vec2(x, y)
}

enum class ItemType(val label: String, val drawableId: Int) {
    CATNIP("CATNIP", R.drawable.item_catnip),
    SODA("CHEESE-SODA", R.drawable.item_cheese_soda),
    ENERGY("ZESTY BAR", R.drawable.item_zesty_bar)
}

data class WorldPickup(
    val position: Vec2,
    val type: ItemType,
    var collected: Boolean = false
)

data class Notebook(
    val position: Vec2,
    var collected: Boolean = false,
    var impossible: Boolean = false
)

data class MathProblem(val text: String, val answer: Int?, val impossible: Boolean)

enum class GamePhase { INTRO, PLAYING, MATH, CAUGHT, WON }
