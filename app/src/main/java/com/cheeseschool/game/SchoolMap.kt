package com.cheeseschool.game

object SchoolMap {
    const val ROWS = 17
    const val COLS = 29
    const val HALLWAY_TOP = 7
    const val HALLWAY_BOTTOM = 9
    const val HALLWAY_MID = 8

    data class Room(val x: Int, val y: Int, val width: Int, val height: Int)

    val rooms = listOf(
        Room(2, 2, 5, 5), Room(9, 2, 5, 5), Room(16, 2, 5, 5), Room(23, 2, 4, 5),
        Room(2, 10, 5, 5), Room(9, 10, 5, 5), Room(16, 10, 5, 5), Room(23, 10, 4, 5)
    )

    /** 0 hallway, 1 wall, 2 notebook floor, 3 classroom floor. */
    fun create(): Array<IntArray> {
        val grid = Array(ROWS) { IntArray(COLS) { 1 } }
        carve(grid, 1, HALLWAY_TOP, COLS - 2, 3, 0)
        rooms.forEach { room ->
            carve(grid, room.x, room.y, room.width, room.height, 3)
            val doorX = room.x + room.width / 2
            if (room.y < HALLWAY_TOP) grid[HALLWAY_TOP - 1][doorX] = 0
            else grid[HALLWAY_BOTTOM + 1][doorX] = 0
            grid[room.y + room.height / 2][doorX] = 2
        }
        return grid
    }

    private fun carve(grid: Array<IntArray>, x: Int, y: Int, width: Int, height: Int, value: Int) {
        for (row in y until y + height) {
            for (col in x until x + width) {
                if (row in grid.indices && col in grid[0].indices) grid[row][col] = value
            }
        }
    }
}
