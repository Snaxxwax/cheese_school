package com.cheeseschool.game

import android.os.SystemClock
import java.util.ArrayDeque
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

class GameEngine(private val events: Events) {
    interface Events {
        fun showMath(problem: MathProblem)
        fun showMessage(message: String)
        fun cheeseNearby()
        fun phaseChanged(phase: GamePhase)
    }

    companion object {
        const val FOV = 1.22173f // 70 degrees
        const val PLAYER_SPEED = 1.30f
        const val SPRINT_MULTIPLIER = 1.75f
        const val CATCH_RADIUS = 0.33f
        const val NOTEBOOK_RADIUS = 0.40f
        const val PICKUP_RADIUS = 0.38f
        const val EXIT_RADIUS = 0.42f
        const val VENDING_RADIUS = 0.72f
    }

    val grid = SchoolMap.create()
    val player = Vec2(2.5f, 8.5f)
    val cheese = Vec2(26.5f, 8.5f)
    val vending = Vec2(4.3f, 8.3f)
    val exits = listOf(Vec2(1.5f, 8.5f), Vec2(27.5f, 8.5f))
    val notebooks = mutableListOf<Notebook>()
    val pickups = mutableListOf<WorldPickup>()
    val inventory = arrayOfNulls<ItemType>(3)

    var phase = GamePhase.INTRO
        private set
    var yaw = 0f
    var score = 0
        private set
    var coins = 0
        private set
    var stamina = 1f
        private set
    var sprinting = false
        private set
    var exhausted = false
        private set
    var escapeMode = false
        private set
    var joystickX = 0f
    var joystickY = 0f
    var sprintHeld = false
    var danger = 0f
        private set
    var vendingStock = ItemType.CATNIP
        private set

    private var pendingNotebook: Notebook? = null
    private var currentProblem: MathProblem? = null
    private var cheeseBonusSpeed = 0f
    private var cheeseActiveAt = Float.POSITIVE_INFINITY
    private var catnipUntil = 0f
    private var catnipTarget: Vec2? = null
    private var cheeseStunnedUntil = 0f
    private var cheeseSlowedUntil = 0f
    private var energyUntil = 0f
    private var notebookCooldownUntil = 0f
    private var messageUntil = 0f
    private var cheeseSoundAt = 0f
    private var pathRefreshAt = 0f
    private var lastTargetCell = -1
    private var cheesePath = ArrayDeque<Vec2>()

    var message: String = ""
        private set

    val totalNotebooks: Int get() = notebooks.size
    val visibleNotebookCount: Int get() = notebooks.count { !it.collected }
    val isMoving: Boolean get() = hypot(joystickX, joystickY) > 0.12f

    init {
        populateWorld()
    }

    fun startGame() {
        populateWorld()
        player.x = 2.5f
        player.y = 8.5f
        cheese.x = 26.5f
        cheese.y = 8.5f
        yaw = 0f
        score = 0
        coins = 0
        stamina = 1f
        sprinting = false
        exhausted = false
        escapeMode = false
        inventory.fill(null)
        cheeseBonusSpeed = 0f
        catnipUntil = 0f
        catnipTarget = null
        cheeseStunnedUntil = 0f
        cheeseSlowedUntil = 0f
        energyUntil = 0f
        notebookCooldownUntil = 0f
        cheeseActiveAt = now() + 3f
        cheeseSoundAt = 0f
        cheesePath.clear()
        rerollVending()
        message = ""
        setPhase(GamePhase.PLAYING)
    }

    private fun populateWorld() {
        notebooks.clear()
        pickups.clear()
        SchoolMap.rooms.forEachIndexed { index, room ->
            val notebookX = room.x + room.width / 2 + 0.5f
            val notebookY = room.y + room.height / 2 + 0.5f
            notebooks += Notebook(Vec2(notebookX, notebookY))
            if (index % 2 == 0) {
                val types = listOf(ItemType.SODA, ItemType.ENERGY, ItemType.CATNIP)
                pickups += WorldPickup(
                    Vec2(room.x + 1.5f, room.y + 1.5f),
                    types[(index / 2) % types.size]
                )
            }
        }
    }

    fun pauseForLifecycle() {
        sprintHeld = false
        joystickX = 0f
        joystickY = 0f
    }

    fun turn(delta: Float) {
        if (phase == GamePhase.PLAYING) yaw = normalizeAngle(yaw + delta)
    }

    fun update(deltaSeconds: Float) {
        val dt = min(deltaSeconds, 0.05f)
        val time = now()
        if (message.isNotEmpty() && time >= messageUntil) message = ""
        if (phase != GamePhase.PLAYING) return

        updateStamina(dt, time)
        updatePlayer(dt, time)
        updateCheese(dt, time)
        if (phase != GamePhase.PLAYING) return
        checkNotebook(time)
        checkPickup()
        checkExit()
    }

    private fun updateStamina(dt: Float, time: Float) {
        val boosted = time < energyUntil
        val wantsSprint = sprintHeld && isMoving
        when {
            boosted && wantsSprint -> {
                sprinting = true
                stamina = min(1f, stamina + 0.32f * dt)
            }
            wantsSprint && !exhausted && stamina > 0f -> {
                sprinting = true
                stamina = max(0f, stamina - 0.55f * dt)
                if (stamina <= 0f) {
                    exhausted = true
                    sprinting = false
                }
            }
            else -> {
                sprinting = false
                stamina = min(1f, stamina + 0.32f * dt)
                if (exhausted && stamina >= 0.30f) exhausted = false
            }
        }
    }

    private fun updatePlayer(dt: Float, time: Float) {
        if (!isMoving) return
        val magnitude = min(1f, hypot(joystickX, joystickY))
        val normalizedX = joystickX / max(magnitude, 0.001f)
        val normalizedY = joystickY / max(magnitude, 0.001f)
        val boosted = time < energyUntil
        val multiplier = if (sprinting) {
            if (boosted) SPRINT_MULTIPLIER * 1.1f else SPRINT_MULTIPLIER
        } else 1f
        val distance = PLAYER_SPEED * multiplier * magnitude * dt
        val forwardX = cos(yaw)
        val forwardY = sin(yaw)
        val rightX = -sin(yaw)
        val rightY = cos(yaw)
        val dx = (forwardX * normalizedY + rightX * normalizedX) * distance
        val dy = (forwardY * normalizedY + rightY * normalizedX) * distance
        moveWithCollision(player, dx, dy, 0.16f)
    }

    private fun updateCheese(dt: Float, time: Float) {
        if (time < cheeseActiveAt) {
            danger = 0f
            return
        }
        val distanceToPlayer = cheese.distanceTo(player)
        danger = (1f - distanceToPlayer / 3.2f).coerceIn(0f, 1f)
        if (time < cheeseStunnedUntil) return

        val distracted = time < catnipUntil && catnipTarget != null
        val target = if (distracted) catnipTarget!! else player
        if (cheese.distanceTo(target) > CATCH_RADIUS) {
            val moveTarget = cheeseMoveTarget(target, time)
            val dx = moveTarget.x - cheese.x
            val dy = moveTarget.y - cheese.y
            val length = hypot(dx, dy)
            if (length > 0.001f) {
                var speed = cheeseSpeed()
                if (distracted) speed *= 0.30f
                if (time < cheeseSlowedUntil) speed *= 0.45f
                val amount = min(speed * dt, length)
                moveWithCollision(cheese, dx / length * amount, dy / length * amount, 0.12f)
            }
        }

        val newDistance = cheese.distanceTo(player)
        if (!distracted && newDistance <= CATCH_RADIUS) {
            danger = 0f
            setPhase(GamePhase.CAUGHT)
            return
        }
        val soundInterval = max(0.7f, newDistance * 0.50f)
        if (newDistance < 3.2f && time - cheeseSoundAt > soundInterval) {
            cheeseSoundAt = time
            events.cheeseNearby()
        }
    }

    private fun cheeseSpeed(): Float {
        val escapeBoost = if (escapeMode) 0.40f else 0f
        return min(2.0f, 0.40f + score * 0.1375f + cheeseBonusSpeed + escapeBoost)
    }

    private fun checkNotebook(time: Float) {
        if (time < notebookCooldownUntil) return
        val notebook = notebooks.firstOrNull { !it.collected && player.distanceTo(it.position) < NOTEBOOK_RADIUS }
            ?: return
        val impossible = score == 2
        notebook.impossible = impossible
        pendingNotebook = notebook
        currentProblem = if (impossible) {
            MathProblem("◹⟁⌧ + ⍝⏧ × ⟆◇⍫ = ⊠", null, true)
        } else {
            generateProblem()
        }
        setPhase(GamePhase.MATH)
        events.showMath(currentProblem!!)
    }

    private fun generateProblem(): MathProblem {
        val operations = when {
            score < 2 -> listOf('+')
            score < 4 -> listOf('+', '-')
            else -> listOf('+', '-', '×')
        }
        val op = operations.random()
        val a: Int
        val b: Int
        val answer: Int
        when (op) {
            '+' -> {
                a = Random.nextInt(1, 11); b = Random.nextInt(1, 11); answer = a + b
            }
            '-' -> {
                a = Random.nextInt(5, 20); b = Random.nextInt(0, min(a, 10)); answer = a - b
            }
            else -> {
                a = Random.nextInt(2, 10); b = Random.nextInt(2, 10); answer = a * b
            }
        }
        return MathProblem("$a $op $b = ?", answer, false)
    }

    fun submitAnswer(raw: String) {
        if (phase != GamePhase.MATH) return
        val problem = currentProblem ?: return
        val notebook = pendingNotebook ?: return
        if (problem.impossible) {
            collectNotebook(notebook)
            cheeseBonusSpeed += 0.35f
            showMessage("THE PROBLEM WAS IMPOSSIBLE! CHEESE IS FURIOUS!", 2.2f)
        } else {
            val guess = raw.trim().toIntOrNull()
            if (guess == problem.answer) {
                collectNotebook(notebook)
                showMessage("NOTEBOOK + 1 COIN!", 1.4f)
            } else {
                cheeseBonusSpeed += 0.1125f
                showMessage("WRONG! CHEESE IS FASTER!", 1.6f)
            }
        }
        pendingNotebook = null
        currentProblem = null
        notebookCooldownUntil = now() + 0.75f
        setPhase(GamePhase.PLAYING)
    }

    private fun collectNotebook(notebook: Notebook) {
        notebook.collected = true
        score++
        coins++
        if (score >= notebooks.size) {
            escapeMode = true
            showMessage("ALL NOTEBOOKS! RUN TO A GREEN EXIT!", 2.6f)
        }
    }

    private fun checkPickup() {
        val pickup = pickups.firstOrNull { !it.collected && player.distanceTo(it.position) < PICKUP_RADIUS }
            ?: return
        val slot = inventory.indexOfFirst { it == null }
        if (slot == -1) {
            if (message != "INVENTORY FULL!") showMessage("INVENTORY FULL!", 0.9f)
            return
        }
        inventory[slot] = pickup.type
        pickup.collected = true
        showMessage("PICKED UP ${pickup.type.label}!", 1.3f)
    }

    private fun checkExit() {
        if (escapeMode && exits.any { player.distanceTo(it) < EXIT_RADIUS }) {
            danger = 0f
            setPhase(GamePhase.WON)
        }
    }

    fun useItem(index: Int) {
        if (phase != GamePhase.PLAYING || index !in inventory.indices) return
        val item = inventory[index] ?: return
        val time = now()
        when (item) {
            ItemType.CATNIP -> {
                catnipTarget = player.copyValue()
                catnipUntil = time + 5f
                showMessage("CATNIP! CHEESE IS DISTRACTED!", 1.4f)
            }
            ItemType.SODA -> {
                pushCheeseAway()
                cheeseSlowedUntil = time + 2.5f
                cheeseStunnedUntil = time + 0.6f
                showMessage("CHEESE-SODA! KNOCKED CHEESE BACK!", 1.4f)
            }
            ItemType.ENERGY -> {
                stamina = 1f
                exhausted = false
                energyUntil = time + 6f
                showMessage("ZESTY BAR! UNLIMITED RUNNING!", 1.4f)
            }
        }
        inventory[index] = null
    }

    private fun pushCheeseAway() {
        var dx = cheese.x - player.x
        var dy = cheese.y - player.y
        val length = hypot(dx, dy)
        if (length < 0.001f) {
            dx = 1f; dy = 0f
        } else {
            dx /= length; dy /= length
        }
        repeat(22) {
            val oldX = cheese.x
            val oldY = cheese.y
            moveWithCollision(cheese, dx * 0.125f, dy * 0.125f, 0.12f)
            if (cheese.x == oldX && cheese.y == oldY) return
        }
    }

    fun canBuy(): Boolean = phase == GamePhase.PLAYING && player.distanceTo(vending) < VENDING_RADIUS

    fun buyFromVending() {
        if (!canBuy()) return
        if (coins <= 0) {
            showMessage("NEED A COIN!", 1.2f)
            return
        }
        val slot = inventory.indexOfFirst { it == null }
        if (slot == -1) {
            showMessage("INVENTORY FULL!", 1.2f)
            return
        }
        coins--
        inventory[slot] = vendingStock
        showMessage("BOUGHT ${vendingStock.label}!", 1.3f)
        rerollVending()
    }

    private fun rerollVending() {
        vendingStock = ItemType.entries.random()
    }

    private fun showMessage(value: String, duration: Float) {
        message = value
        messageUntil = now() + duration
        events.showMessage(value)
    }

    private fun setPhase(value: GamePhase) {
        phase = value
        joystickX = 0f
        joystickY = 0f
        sprintHeld = false
        events.phaseChanged(value)
    }

    fun isWall(x: Float, y: Float, radius: Float = 0f): Boolean {
        val corners = arrayOf(
            Vec2(x - radius, y - radius), Vec2(x + radius, y - radius),
            Vec2(x - radius, y + radius), Vec2(x + radius, y + radius)
        )
        return corners.any {
            val col = floor(it.x).toInt()
            val row = floor(it.y).toInt()
            row !in 0 until SchoolMap.ROWS || col !in 0 until SchoolMap.COLS || grid[row][col] == 1
        }
    }

    private fun isVendingBlocked(x: Float, y: Float, radius: Float): Boolean {
        return abs(x - vending.x) < 0.18f + radius && abs(y - vending.y) < 0.34f + radius
    }

    private fun moveWithCollision(entity: Vec2, dx: Float, dy: Float, radius: Float) {
        val nextX = entity.x + dx
        val nextY = entity.y + dy
        if (!isWall(nextX, entity.y, radius) && !isVendingBlocked(nextX, entity.y, radius)) entity.x = nextX
        if (!isWall(entity.x, nextY, radius) && !isVendingBlocked(entity.x, nextY, radius)) entity.y = nextY
    }

    private fun hasLineOfSight(from: Vec2, to: Vec2): Boolean {
        val dx = to.x - from.x
        val dy = to.y - from.y
        val distance = hypot(dx, dy)
        val steps = max(1, (distance / 0.22f).toInt())
        for (i in 1 until steps) {
            val t = i.toFloat() / steps
            if (isWall(from.x + dx * t, from.y + dy * t)) return false
        }
        return true
    }

    private fun cheeseMoveTarget(target: Vec2, time: Float): Vec2 {
        if (hasLineOfSight(cheese, target)) {
            cheesePath.clear()
            return target
        }
        val targetCol = floor(target.x).toInt()
        val targetRow = floor(target.y).toInt()
        val key = targetRow * SchoolMap.COLS + targetCol
        if (time >= pathRefreshAt || key != lastTargetCell || cheesePath.isEmpty()) {
            cheesePath = findPath(
                floor(cheese.x).toInt(), floor(cheese.y).toInt(), targetCol, targetRow
            )
            pathRefreshAt = time + 0.35f
            lastTargetCell = key
        }
        while (cheesePath.isNotEmpty() && cheese.distanceTo(cheesePath.first()) < 0.12f) {
            cheesePath.removeFirst()
        }
        return cheesePath.firstOrNull() ?: target
    }

    private fun findPath(startCol: Int, startRow: Int, targetCol: Int, targetRow: Int): ArrayDeque<Vec2> {
        val result = ArrayDeque<Vec2>()
        if (!walkable(startCol, startRow) || !walkable(targetCol, targetRow)) return result
        val startKey = startRow * SchoolMap.COLS + startCol
        val targetKey = targetRow * SchoolMap.COLS + targetCol
        val queue = ArrayDeque<Int>()
        val previous = IntArray(SchoolMap.ROWS * SchoolMap.COLS) { -2 }
        previous[startKey] = -1
        queue.add(startKey)
        val directions = intArrayOf(1, 0, -1, 0, 1)
        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            if (current == targetKey) break
            val col = current % SchoolMap.COLS
            val row = current / SchoolMap.COLS
            for (i in 0 until 4) {
                val nextCol = col + directions[i]
                val nextRow = row + directions[i + 1]
                if (!walkable(nextCol, nextRow)) continue
                val next = nextRow * SchoolMap.COLS + nextCol
                if (previous[next] != -2) continue
                previous[next] = current
                queue.add(next)
            }
        }
        if (previous[targetKey] == -2) return result
        val reversed = mutableListOf<Int>()
        var current = targetKey
        while (current != startKey && current >= 0) {
            reversed += current
            current = previous[current]
        }
        reversed.asReversed().forEach {
            result.add(Vec2(it % SchoolMap.COLS + 0.5f, it / SchoolMap.COLS + 0.5f))
        }
        return result
    }

    private fun walkable(col: Int, row: Int): Boolean {
        return row in 0 until SchoolMap.ROWS && col in 0 until SchoolMap.COLS && grid[row][col] != 1
    }

    private fun normalizeAngle(value: Float): Float {
        var angle = value
        val pi = Math.PI.toFloat()
        while (angle > pi) angle -= pi * 2f
        while (angle < -pi) angle += pi * 2f
        return angle
    }

    private fun now(): Float = SystemClock.elapsedRealtime() / 1000f
}
