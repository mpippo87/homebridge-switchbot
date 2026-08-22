import { describe, expect, it, vi } from 'vitest'

import { getDeviceCommandHandler } from '../../src/deviceCommandMapper'
import { RollerShadeDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

describe('curtain hold position', () => {
  it('should expose HomeKit HoldPosition for Roller Shade and send pause', async () => {
    const client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    const rollerShade = new RollerShadeDevice(
      { id: 'shade1', type: 'Roller Shade', log: mockLogger },
      { _client: client, blePollingEnabled: false, log: mockLogger } as any,
    )

    const accessory = rollerShade.createHAPAccessory({})
    const windowCovering = accessory.services.find((service: any) => service.type === 'WindowCovering')

    expect(windowCovering.characteristics.HoldPosition).toBeDefined()

    await windowCovering.characteristics.HoldPosition.set()

    expect(client.setDeviceState).toHaveBeenCalledWith('shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
  })

  it('should route Roller Shade pause commands to the device pause method', async () => {
    const pause = vi.fn().mockResolvedValue({ status: 'success' })
    const handler = getDeviceCommandHandler('roller shade', 'pause')

    await handler?.({ pause }, {})

    expect(pause).toHaveBeenCalledOnce()
  })

  it('should expose momentary up/down switches that pause on a second press while moving', async () => {
    const client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    const rollerShade = new RollerShadeDevice(
      { id: 'shade1', name: 'Office Blind', type: 'Roller Shade', log: mockLogger },
      { _client: client, blePollingEnabled: false, log: mockLogger } as any,
    )

    const accessory = rollerShade.createHAPAccessory({})
    const switches = accessory.services.filter((service: any) => service.type === 'Switch')
    const up = switches.find((service: any) => service.subtype === 'blind-up-command')
    const down = switches.find((service: any) => service.subtype === 'blind-down-command')

    expect(up?.name).toBe('Blind Up')
    expect(down?.name).toBe('Blind Down')

    await up.characteristics.On.set(true)
    await up.characteristics.On.set(true)
    await down.characteristics.On.set(true)

    expect(client.setDeviceState).toHaveBeenNthCalledWith(1, 'shade1', {
      command: 'setPosition',
      parameter: '0',
      commandType: 'command',
    })
    expect(client.setDeviceState).toHaveBeenNthCalledWith(2, 'shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
    expect(client.setDeviceState).toHaveBeenNthCalledWith(3, 'shade1', {
      command: 'setPosition',
      parameter: '100',
      commandType: 'command',
    })
  })
})
